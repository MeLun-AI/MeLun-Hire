"""Single source of truth for MeLun Hire's persistent filesystem locations.

Every module that touches the SQLite database or the uploaded-file store
resolves its paths from here, so that production can point both at a persistent
volume (for example a Render Disk) purely through environment variables, while
local development keeps the historical defaults and behaviour.

Supported environment variables
-------------------------------
DATABASE_URL : str
    Database connection string. Only SQLite is supported by the current data
    layer (``database/db.py`` talks to the ``sqlite3`` driver directly), so the
    accepted forms are:

        sqlite:///relative/database.db     # relative to the backend directory
        sqlite:////absolute/database.db    # absolute path
        sqlite:///:memory:                 # in-memory (tests only)

    A PostgreSQL URL (``postgres://`` / ``postgresql://``) is recognised and
    rejected with an explicit error instead of silently using a local SQLite
    file, because switching engines also requires migrating the whole data
    layer. See DEPLOYMENT.md.

DB_PATH : str
    Direct filesystem path to the SQLite database file. Used only when
    ``DATABASE_URL`` is not set. Convenience override for local tooling.

STORAGE_DIR : str
    Root directory for uploaded files (resumes and profile images). Defaults to
    ``<backend>/data``. Point this at a mounted persistent volume in production.
"""
from __future__ import annotations

import os
from pathlib import Path

# Backend/3.Chat bot/  (this file lives in Backend/3.Chat bot/config/)
BACKEND_DIR = Path(__file__).resolve().parent.parent

_SUPPORTED_SCHEME_PREFIXES = ("sqlite:", "sqlite3:")


def _resolve_db_path() -> str:
    """Resolve the SQLite file path from DATABASE_URL / DB_PATH, or the default."""
    raw_url = (os.environ.get("DATABASE_URL") or "").strip()
    if raw_url:
        lowered = raw_url.lower()
        if lowered.startswith(("postgres://", "postgresql://", "postgresql+")):
            raise RuntimeError(
                "DATABASE_URL points at PostgreSQL, but this build's data layer is "
                "SQLite-only (database/db.py uses the sqlite3 driver directly). "
                "Point DATABASE_URL at a sqlite:/// file on a persistent volume, or "
                "complete the PostgreSQL migration before switching engines. "
                "See DEPLOYMENT.md for details."
            )
        if lowered.startswith(_SUPPORTED_SCHEME_PREFIXES):
            remainder = raw_url.split(":", 1)[1]
            if remainder.endswith(":memory:"):
                return ":memory:"
            slashes = len(remainder) - len(remainder.lstrip("/"))
            candidate = remainder[slashes:]
            if slashes >= 4 or candidate.startswith("/"):
                # sqlite:////absolute/path -> absolute
                return str(Path("/" + candidate.lstrip("/")))
            # sqlite:///relative/path -> relative to the backend directory
            return str(BACKEND_DIR / candidate)
        # Not a recognised URL: treat the value as a plain filesystem path.
        return str(Path(raw_url))

    raw_path = (os.environ.get("DB_PATH") or "").strip()
    if raw_path:
        candidate = Path(raw_path)
        if not candidate.is_absolute():
            candidate = BACKEND_DIR / candidate
        return str(candidate)

    return str(BACKEND_DIR / "database" / "database.db")


DB_PATH = _resolve_db_path()

# Root directory for uploaded files. Defaults to the historical <backend>/data.
_raw_storage = (os.environ.get("STORAGE_DIR") or "").strip()
DATA_DIR = Path(_raw_storage) if _raw_storage else (BACKEND_DIR / "data")
if not DATA_DIR.is_absolute():
    DATA_DIR = BACKEND_DIR / DATA_DIR

RESUME_DIR = str(DATA_DIR / "resumes")
PROFILE_IMG_DIR = str(DATA_DIR / "profile_images")


def resolve_stored_path(stored: str) -> str:
    """Map a database-stored relative path onto the configured storage root.

    Uploads are recorded in the database as ``data/<sub>/<file>`` (relative to
    the backend directory). Resolving them through ``DATA_DIR`` keeps those rows
    valid when ``STORAGE_DIR`` points somewhere else in production.
    """
    if not stored:
        return ""
    normalised = str(stored).replace("\\", "/").lstrip("/")
    if normalised.startswith("data/"):
        normalised = normalised[len("data/"):]
    return str(DATA_DIR / normalised)
