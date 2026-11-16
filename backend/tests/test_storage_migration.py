import sqlite3
from pathlib import Path
import pytest
from storage_migration import DATABASE_FILENAME, LEGACY_DATABASE_FILENAME, default_database_url

def test_local_database_rename_keeps_room_data(tmp_path):
    previous=tmp_path/LEGACY_DATABASE_FILENAME
    with sqlite3.connect(previous) as db:
        db.execute('CREATE TABLE rooms (code TEXT PRIMARY KEY)')
        db.execute("INSERT INTO rooms VALUES ('01234')")
    db.close()
    url=default_database_url(tmp_path)
    assert url.endswith('/'+DATABASE_FILENAME)
    assert not previous.exists()
    with sqlite3.connect(tmp_path/DATABASE_FILENAME) as db:
        assert db.execute('SELECT code FROM rooms').fetchone()[0]=='01234'
        assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
    db.close()
    assert default_database_url(tmp_path)==url

def test_migration_never_overwrites_an_existing_database(tmp_path):
    (tmp_path/LEGACY_DATABASE_FILENAME).write_bytes(b'previous')
    (tmp_path/DATABASE_FILENAME).write_bytes(b'current')
    with pytest.raises(RuntimeError,match='neither file was overwritten'):
        default_database_url(tmp_path)
    assert (tmp_path/DATABASE_FILENAME).read_bytes()==b'current'

def test_locked_database_is_left_untouched(tmp_path,monkeypatch):
    previous=tmp_path/LEGACY_DATABASE_FILENAME
    previous.write_bytes(b'room data')
    def locked(*args): raise PermissionError('file is open')
    monkeypatch.setattr(Path,'rename',locked)
    with pytest.raises(RuntimeError,match='Stop the running local API'):
        default_database_url(tmp_path)
    assert previous.read_bytes()==b'room data'
