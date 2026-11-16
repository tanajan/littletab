"""One-time migration for the previous local SQLite filename."""
from pathlib import Path

LEGACY_DATABASE_FILENAME = 'calbud.db'
DATABASE_FILENAME = 'littletab.db'

def default_database_url(directory: Path | None = None) -> str:
    directory = (directory or Path.cwd()).resolve()
    previous = directory / LEGACY_DATABASE_FILENAME
    current = directory / DATABASE_FILENAME
    if previous.exists():
        if current.exists():
            raise RuntimeError('Both the previous and Littletab database files exist. Set DATABASE_URL explicitly; neither file was overwritten.')
        try:
            previous.rename(current)
        except OSError as exc:
            raise RuntimeError('Stop the running local API, then restart it to finish renaming the Littletab database. Your existing database was not changed.') from exc
    return f'sqlite:///{current.as_posix()}'
