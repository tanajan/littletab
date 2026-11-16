"""Littletab API. PostgreSQL in production; explicit SQLite option for local development/tests."""
import asyncio
import base64
import hashlib
import hmac
import os
import logging
import re
import secrets
from pathlib import Path
from contextlib import asynccontextmanager, suppress
from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal

from fastapi import FastAPI, Header, HTTPException
from fastapi.staticfiles import StaticFiles
from storage_migration import default_database_url
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import JSON, DateTime, Integer, String, create_engine, delete, select, update
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

DATABASE_URL = os.environ.get("DATABASE_URL") or default_database_url()
if DATABASE_URL.startswith(("postgres://", "postgresql://")):
    DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL.split("://", 1)[1]
engine = create_engine(DATABASE_URL, pool_pre_ping=True, **({"connect_args": {"check_same_thread": False}} if DATABASE_URL.startswith("sqlite") else {}))
Session = sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

class Room(Base):
    __tablename__ = "rooms"
    code: Mapped[str] = mapped_column(String(5), primary_key=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    owner_hash: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    data: Mapped[dict] = mapped_column(JSON)

class Access(Base):
    __tablename__ = "room_sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    code: Mapped[str] = mapped_column(String(5), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)

# Persistent, database-backed rate limiting bounds password attempts across workers.
class Attempt(Base):
    __tablename__ = "join_attempts"
    code: Mapped[str] = mapped_column(String(5), primary_key=True)
    count: Mapped[int] = mapped_column(Integer)
    reset_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

Base.metadata.create_all(engine)

def utcnow():
    return datetime.now(timezone.utc)

def aware(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value

def digest(value: str):
    return hashlib.sha256(value.encode()).hexdigest()

def password_hash(password: str, salt=None):
    salt = salt or secrets.token_hex(16)
    result = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1)
    return salt + ":" + base64.b64encode(result).decode()

def purge():
    with Session.begin() as db:
        expired = select(Room.code).where(Room.expires_at <= utcnow())
        db.execute(delete(Access).where((Access.expires_at <= utcnow()) | Access.code.in_(expired)))
        db.execute(delete(Attempt).where(Attempt.reset_at <= utcnow()))
        db.execute(delete(Room).where(Room.expires_at <= utcnow()))

async def cleanup():
    while True:
        try:
            await asyncio.to_thread(purge)
        except SQLAlchemyError:
            logging.exception("Room cleanup failed; retrying in 60 seconds")
        await asyncio.sleep(60)

@asynccontextmanager
async def lifespan(app):
    task = asyncio.create_task(cleanup())
    yield
    task.cancel()
    with suppress(asyncio.CancelledError):
        await task

app = FastAPI(title="Littletab", lifespan=lifespan)

class CreateRoom(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    password: str = Field(pattern=r"^[0-9]{4}$")
    currency: str = Field(pattern=r"^(GBP|USD|EUR|THB)$", default="GBP")
    creator: str = Field(min_length=1, max_length=40)

class JoinRoom(BaseModel):
    password: str = Field(min_length=1, max_length=128)

class IdentifyPerson(BaseModel):
    personId: str | None = Field(default=None, min_length=1, max_length=50)
    name: str | None = Field(default=None, min_length=1, max_length=40)

    @model_validator(mode="after")
    def one_identity(self):
        if bool(self.personId) == bool(self.name) or (self.name is not None and not self.name.strip()):
            raise ValueError("Pick an existing person or enter a new name.")
        return self

class PaymentPreference(BaseModel):
    method: Literal['bank', 'paypal']
    accountName: str | None = Field(default=None, max_length=100)
    sortCode: str | None = Field(default=None, max_length=6)
    accountNumber: str | None = Field(default=None, max_length=8)
    paypal: str | None = Field(default=None, max_length=150)

    @model_validator(mode="after")
    def valid_details(self):
        if self.method == 'bank':
            if not self.accountName or not self.accountName.strip() or not re.fullmatch(r'[0-9]{6}', self.sortCode or '') or not re.fullmatch(r'[0-9]{8}', self.accountNumber or ''):
                raise ValueError('Enter an account name, six-digit sort code and eight-digit account number.')
            self.accountName = self.accountName.strip()
            self.paypal = None
        else:
            if not re.fullmatch(r'(https://(?:www\.)?paypal\.me/[A-Za-z0-9_-]+/?|[^@\s/]+@[^@\s/]+\.[^@\s/]+)', self.paypal or ''):
                raise ValueError('Enter a PayPal email or an https://paypal.me/ link.')
            self.accountName = self.sortCode = self.accountNumber = None
        return self

class Person(BaseModel):
    id: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=40)
    avatar: Literal['cat', 'capybara', 'dog', 'chameleon'] | None = None
    payment: PaymentPreference | None = None

class Item(BaseModel):
    id: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=100)
    amount: int = Field(gt=0, le=100_000_000)
    paidBy: str
    participants: list[str] = Field(min_length=1, max_length=100)
    allocations: dict[str, Annotated[int, Field(ge=0, le=100_000_000, strict=True)]] = Field(default_factory=dict)

    @model_validator(mode="after")
    def valid_split(self):
        if not set(self.allocations) <= set(self.participants):
            raise ValueError("Custom amounts must belong to selected participants")
        specified = sum(self.allocations.values())
        if specified > self.amount:
            raise ValueError("Custom amounts exceed the expense total")
        if len(self.allocations) == len(self.participants) and specified != self.amount:
            raise ValueError("Custom amounts must add up to the total, or leave someone blank")
        return self

class RoomData(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    currency: str = Field(pattern=r"^(GBP|USD|EUR|THB)$")
    people: list[Person] = Field(min_length=1, max_length=100)
    items: list[Item] = Field(max_length=1000)
    version: int = Field(ge=1)

    @model_validator(mode="after")
    def references(self):
        ids = {p.id for p in self.people}
        if len(ids) != len(self.people) or len({i.id for i in self.items}) != len(self.items):
            raise ValueError("Duplicate identifiers")
        if any(not p.name.strip() for p in self.people) or not self.name.strip():
            raise ValueError("Names cannot be blank")
        for item in self.items:
            if not item.name.strip() or item.paidBy not in ids or not set(item.participants) <= ids or len(set(item.participants)) != len(item.participants):
                raise ValueError("Invalid item participants or payer")
        return self

def view(room):
    return {**room.data, "code": room.code, "version": room.version, "expiresAt": aware(room.expires_at).isoformat()}

def authorize(db, code, authorization):
    token = (authorization or "").removeprefix("Bearer ")
    access = db.get(Access, digest(token))
    room = db.get(Room, code)
    if not access or access.code != code or aware(access.expires_at) <= utcnow():
        raise HTTPException(401, "Please join this room again.")
    if not room or aware(room.expires_at) <= utcnow():
        raise HTTPException(404, "This room has expired or was deleted.")
    return room

def issue_session(db, room):
    token = secrets.token_urlsafe(32)
    db.add(Access(token_hash=digest(token), code=room.code, expires_at=room.expires_at))
    return token

@app.get("/api/health")
def health():
    try:
        with Session() as db:
            db.execute(select(1))
    except SQLAlchemyError:
        raise HTTPException(503, "Database is temporarily unavailable.")
    return {"status": "ok"}

@app.post("/api/rooms", status_code=201)
def create_room(body: CreateRoom):
    if not body.name.strip() or not body.creator.strip():
        raise HTTPException(422, "Please enter a room name and your name.")
    purge()
    owner = secrets.token_urlsafe(32)
    hashed = password_hash(body.password)
    for _ in range(25):
        try:
            with Session.begin() as db:
                room = Room(code=f"{secrets.randbelow(100000):05d}", password_hash=hashed, owner_hash=digest(owner), expires_at=utcnow()+timedelta(days=30), version=1, data={"name": body.name.strip(), "currency": body.currency, "people": [{"id": secrets.token_hex(8), "name": body.creator.strip(), "avatar": secrets.choice(["cat", "capybara", "dog", "chameleon"])}], "items": []})
                db.add(room)
                db.flush()
                token = issue_session(db, room)
                return {"room": view(room), "token": token, "ownerToken": owner, "personId": room.data["people"][0]["id"]}
        except IntegrityError:
            continue
    raise HTTPException(503, "Rooms are busy. Please try again.")

@app.post("/api/rooms/{code}/join")
def join_room(code: str, body: JoinRoom):
    if len(code) != 5 or not code.isascii() or not code.isdigit():
        raise HTTPException(422, "Enter a five-digit room code.")
    with Session.begin() as db:
        db.execute(delete(Attempt).where(Attempt.reset_at <= utcnow()))
        from sqlalchemy.dialects.postgresql import insert as pg_insert
        from sqlalchemy.dialects.sqlite import insert as sqlite_insert
        insert = sqlite_insert if engine.dialect.name == "sqlite" else pg_insert
        statement = insert(Attempt).values(code=code, count=1, reset_at=utcnow()+timedelta(minutes=15))
        statement = statement.on_conflict_do_update(index_elements=[Attempt.code], set_={"count": Attempt.count+1}, where=Attempt.count < 10)
        result = db.execute(statement)
        if result.rowcount != 1:
            raise HTTPException(429, "Too many attempts. Try again in 15 minutes.")
    with Session.begin() as db:
        room = db.get(Room, code)
        # Perform the same expensive password operation for unknown rooms.
        stored = room.password_hash if room else "0"*32 + ":invalid"
        salt = stored.split(":")[0]
        valid = hmac.compare_digest(password_hash(body.password, salt), stored)
        if not valid or not room or aware(room.expires_at) <= utcnow():
            raise HTTPException(401, "Room code or PIN is incorrect, or the room has expired.")
        db.execute(delete(Attempt).where(Attempt.code == code))
        token = issue_session(db, room)
        return {"room": view(room), "token": token}

@app.get("/api/rooms/{code}")
def get_room(code: str, authorization: Annotated[str | None, Header()] = None):
    with Session() as db:
        return view(authorize(db, code, authorization))

@app.post("/api/rooms/{code}/identify")
def identify_person(code: str, body: IdentifyPerson, authorization: Annotated[str | None, Header()] = None):
    with Session.begin() as db:
        room = authorize(db, code, authorization)
        if body.personId:
            if not any(p["id"] == body.personId for p in room.data["people"]):
                raise HTTPException(404, "That person is no longer in this room. Please pick another name.")
            return {"room": view(room), "personId": body.personId}
        name = body.name.strip()
        if any(p["name"].casefold() == name.casefold() for p in room.data["people"]):
            raise HTTPException(409, "This name is already on the list. Pick it above, or use a different name.")
        if len(room.data["people"]) >= 100:
            raise HTTPException(422, "This room already has 100 people. Pick an existing name.")
        person_id = secrets.token_hex(8)
        data = {**room.data, "people": [*room.data["people"], {"id": person_id, "name": name, "avatar": secrets.choice(["cat", "capybara", "dog", "chameleon"])}]}
        result = db.execute(update(Room).where(Room.code == code, Room.version == room.version).values(data=data, version=room.version+1))
        if result.rowcount != 1:
            raise HTTPException(409, "The group just changed. Please try again.")
        db.refresh(room)
        return {"room": view(room), "personId": person_id}

@app.put("/api/rooms/{code}")
def save_room(code: str, body: RoomData, authorization: Annotated[str | None, Header()] = None):
    with Session.begin() as db:
        room = authorize(db, code, authorization)
        data = body.model_dump(exclude={"version"})
        result = db.execute(update(Room).where(Room.code == code, Room.version == body.version).values(data=data, version=body.version+1))
        if result.rowcount != 1:
            raise HTTPException(409, "Someone updated this room. The latest version has been loaded; please try again.")
        db.refresh(room)
        return view(room)

@app.delete("/api/rooms/{code}", status_code=204)
def delete_room(code: str, authorization: Annotated[str | None, Header()] = None, x_owner_token: Annotated[str | None, Header()] = None):
    with Session.begin() as db:
        room = authorize(db, code, authorization)
        if not hmac.compare_digest(digest(x_owner_token or ""), room.owner_hash):
            raise HTTPException(403, "Only the room creator can delete this room.")
        db.execute(delete(Access).where(Access.code == code))
        db.delete(room)

# Serve the compiled React app from the same origin as the API in production.
STATIC_DIR = Path(os.environ.get('STATIC_DIR', str(Path(__file__).resolve().parents[1] / 'frontend' / 'dist')))
if STATIC_DIR.is_dir():
    app.mount('/', StaticFiles(directory=STATIC_DIR, html=True), name='frontend')
