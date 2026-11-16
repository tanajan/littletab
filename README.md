# Littletab

A private, account-free bill splitter for trips, dinners, and everything in between. React + TypeScript frontend, FastAPI API, and PostgreSQL persistence via SQLAlchemy. Nothing has been published or registered with a hosting provider.

## Preview on Windows

From the project root, use two PowerShell terminals:

```powershell
# API (local SQLite preview; no database server needed)
.\.venv\Scripts\python.exe -m uvicorn app:app --app-dir backend --host 127.0.0.1 --port 8000
```

```powershell
# Frontend; Vite proxies /api to the local API
npm run dev --prefix frontend
```

Open the URL Vite prints (normally http://127.0.0.1:5173). The current QA preview uses port 5174. “Try a sample room” works without the API; it is explicitly a disposable, in-memory demo. Real rooms use the API and persist across browser reloads and server restarts.

If dependencies are not installed:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
npm ci --prefix frontend
```

## PostgreSQL

Docker Compose configures PostgreSQL 17 and FastAPI, bound only to localhost. Install Docker if needed, copy `.env.example` to `.env`, set a database password, and run:

```powershell
docker compose up --build -d
npm run dev --prefix frontend
```

Alternatively, connect to an existing PostgreSQL database before starting the API:

```powershell
$env:DATABASE_URL = 'postgresql+psycopg://USER:PASSWORD@HOST:5432/littletab'
.\.venv\Scripts\python.exe -m uvicorn app:app --app-dir backend --host 127.0.0.1 --port 8000
```

The database user needs table-creation privileges on a new, dedicated database. Tables initialize on startup. The root Dockerfile builds React and serves the bundle from FastAPI on the same origin. See [the deployment guide](docs/DEPLOY.md) for the supplied Render Blueprint and local production Compose setup. Hosting configuration is prepared; nothing has been published. Vite is for local development.

## Behavior

- Create a named room with a generated five-digit code, currency, creator name, and a four-digit PIN. Join with the code and PIN or an invite URL and PIN. No accounts or email addresses.
- Hosts can add people and expenses before guests arrive. After entering the room code and PIN, each guest picks a host-created name (preserving all existing expense assignments) or adds a new name. Names are shared identities, not accounts or exclusive claims; the same person can use multiple devices. The selected name is remembered for the tab, and new expenses default to that person as payer. Existing rooms created with longer passwords retain their original password.
- Add up to 100 people and 1,000 expenses. Each item records a payer and selected participants. Anyone with room access can edit. Remove a person only after removing their expense references.
- Money is stored as integer cents. Each expense can mix fixed per-person amounts with automatic shares. Blank amounts divide the remainder equally; leftover cents go to automatic participants in assignment order. Explicit zero is allowed. Fixed amounts cannot exceed the total, and fully specified shares must sum to the total. Debts net across all expenses. Suggested payments settle the balance exactly; payments occur outside Littletab.
- Guests refresh shared data every five seconds. Version checks prevent silently overwriting another person's edit. On conflict, the latest data loads and the user retries their change.
- Four separate PIN inputs support automatic focus, keyboard navigation and pasting all four digits. The join form also retains an older-password option for rooms created before PINs.
- Profiles use cat, capybara, dog or chameleon animal illustrations. New people receive an animal automatically; click your name badge to change it at any time. Older people without a stored animal receive a stable fallback.
- Passwords use salted scrypt. Session and owner tokens are stored hashed on the server. Failed joins are limited to 10 attempts per room in 15 minutes; successful joins reset the counter.
- The owner deletion key stays in this browser's local storage. Room access is kept in tab session storage. Clearing browser data loses the owner key. Anyone who knows the PIN can rejoin; there is no PIN reset.
- Only the creator's browser can delete a room. Deletion has a confirmation dialog. Every room expires 30 days after creation; it cannot be accessed after expiry. A background job removes expired data within a minute while the API is running, and room creation also triggers cleanup. Restarting the API resumes cleanup. Database backups have their own retention outside this app.
- GBP, USD, EUR, and THB are supported; each room has one currency and no exchange-rate conversion. The receipt opens as a read-only image preview with inline zoom and an optional PNG download. It includes every expense (name, payer, split type and amount), the total, everyone’s paid/share/balance, and suggested payments in the room’s currency. Long receipts use multiple downloadable image pages without truncating items. Export runs entirely in the browser; bill data is not uploaded to an image service.

## Checks

```powershell
npm run build --prefix frontend
npm run test --prefix frontend
.\.venv\Scripts\python.exe -m pytest backend/tests -q
```

Tests use an isolated `test-littletab.db`; never point `TEST_DATABASE_URL` at a database with real data because the test fixture recreates its tables. To verify against a disposable PostgreSQL database, set `TEST_DATABASE_URL` to that database's SQLAlchemy URL first.

Build and calculation tests pass. API integration tests cover create/join, authentication, selective expenses, optimistic concurrency, deletion rights, expiry cleanup, validation, session isolation, and rate limits. Browser QA covers desktop (1440px), mobile (390px), room creation/join, participant management, selective expense creation/editing, settlement navigation, invalid selections, and refresh restoration. PostgreSQL is configured but was not executed in this environment because neither PostgreSQL nor Docker is installed; runtime API QA uses SQLite.

## Latest feedback features

The welcome tutorial uses “Make the party. Add the good stuff. Pick your people. Square it up.” and remembers the browser’s “Don’t show this again” preference. The help icon can reopen it. Paper surfaces use a subtle dot grid. Matching animal profiles receive different playful colours; avatars are larger. Each share now has an accessible green Auto switch; switching it off reveals a grey custom-amount field.

Invite friends opens a shareable URL with a Copy link button and manual-copy fallback. The room code is prefilled on arrival, but guests still enter the room PIN. An invite to another room takes priority over an old saved session. Copying after deployment automatically uses the hosted domain.

Optional profile payment preferences support UK bank transfer (account name, six-digit sort code, eight-digit account number) or PayPal (email or PayPal.Me link). Details only appear when expanded in the settlement view, are shared with room members, and are not included in receipt images. Littletab does not process payments.

Latest automated verification: production build, 10 calculation/colour tests and 14 API tests pass, including same-origin production serving. New tutorial/invite/payment visual updates have not been rechecked in a browser because browser automation became unavailable. Docker and live PostgreSQL/Render execution remain unverified on this machine.

## Free hosting

The default `render.yaml` now uses one Render **Free** web service and asks for `DATABASE_URL` from an external **Neon Free** PostgreSQL project. It creates no paid Render database or web plans. Follow [the updated free-deployment guide](docs/DEPLOY.md). The app may sleep between visits; database connections are checked before reuse to recover from idle disconnects. No hosted deployment has been performed.

## Internal naming

Active configuration, browser keys and local database names use `littletab`. Existing browser data migrates once on startup; the previous prefix is retained only in the migration helper for compatibility. The local room database is renamed once on API startup, preserving the file contents. If Windows reports the previous database is locked, stop the old API first and restart it. Migration never overwrites an existing database. Generated dependency files and historical screenshots are not application configuration.

If you already use a PostgreSQL database, its existing connection URL remains valid through `DATABASE_URL`. The Compose database/role names apply to a fresh volume; changing those environment variables does not rename an existing database. Keep using the previous database URL until you explicitly migrate an existing PostgreSQL instance.

## Neon CLI setup

This checkout is linked to the selected Neon project and its production branch. The CLI-created `.neon` link and `.env.local` database credentials stay ignored by Git. `neon.ts` declares Postgres only. For this Python/FastAPI server, SQLAlchemy uses the installed native psycopg driver. FastAPI reads `.env` first, then `.env.local`, without replacing explicit environment variables.

From the repository root:

```powershell
npm run build
npm start
```

Install backend requirements into `.venv` and frontend dependencies with `npm ci --prefix frontend` on a new checkout. `npm start` serves the built React app and API together at http://127.0.0.1:8000. Without a configured database URL, local SQLite remains available. Local SQLite rooms are not automatically copied into Neon.

For a live Neon smoke test, start the app on port 8011 (`$env:PORT='8011'; npm start`) and run `.\.venv\Scripts\python.exe scripts/verify_neon.py` in another terminal. The script creates and deletes only its own temporary verification room and confirms its saved expense directly in Neon. Never run the regular pytest suite against the production Neon database: that suite recreates test tables.

See [the verified Neon setup report](docs/NEON_SETUP.md) for command results and remaining hosting steps.
