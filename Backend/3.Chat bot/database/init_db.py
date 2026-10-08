"""Database initialisation and migration entry point for MeLun Hire.

Usage
-----
    python database/init_db.py          # initialise the database DB_PATH points at
    python db_migrate.py                # legacy name for the same thing
    from database.init_db import init_database
    init_database()

``init_database()`` is called by ``main.py`` *before* any router is imported, so
every table, index and column the API touches already exists by the time the
first request arrives. That is what makes a fresh deployment self-initialising:
``database.db`` is git-ignored, so a new Railway/Render container starts with an
empty volume and previously answered requests with
``sqlite3.OperationalError: no such table: notifications`` (and friends).

The base tables live in ``database/schema.py``. Feature tables keep their DDL in
the module that owns them (notifications, auth sessions, HR notification
preferences, proctoring, Career Quest, Talent Arena) and are applied here through
those existing guards, so no definition is duplicated.

Every step is idempotent and additive: tables are only created when missing,
columns are only added when missing, and application data is never deleted.
"""

import logging
import os
import sqlite3
import sys
from pathlib import Path

# Make "python database/init_db.py" / "python db_migrate.py" work from any cwd.
APP_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if APP_ROOT not in sys.path:
    sys.path.insert(0, APP_ROOT)

from config.paths import DB_PATH
from database.schema import create_base_schema, table_names

logger = logging.getLogger(__name__)

# SQLite raises these when another process applied the same additive change
# between our check and our write (uvicorn --workers > 1, rolling deploys).
# The resulting schema is identical, so they are not failures.
_ALREADY_APPLIED_MARKERS = ("duplicate column name", "already exists")


def _prepare_db_file(db_path: str) -> None:
    """Create the directory holding the SQLite file when it does not exist yet.

    On a fresh container ``DATABASE_URL`` can point at a volume sub-directory
    that has not been created; SQLite cannot create the folder itself and the
    failure would otherwise only surface on the first request.
    """
    if not db_path or db_path == ":memory:" or db_path.startswith("file:"):
        return
    parent = Path(db_path).expanduser().parent
    if parent and not parent.exists():
        parent.mkdir(parents=True, exist_ok=True)
        logger.info("Created database directory %s", parent)


def _connect(db_path: str) -> sqlite3.Connection:
    """Open the schema connection (autocommit, WAL, 30s busy timeout)."""
    conn = sqlite3.connect(
        db_path, timeout=30, isolation_level=None, uri=db_path.startswith("file:")
    )
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA busy_timeout=30000;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    return conn


def _feature_schema_steps(db_path: str):
    """Schema owned by feature modules, as ``(label, callable)`` pairs.

    Imported lazily because these modules build FastAPI routers, and this module
    is also used as a standalone script (``python database/init_db.py``).
    """
    from auth.routes.hr_settings import ensure_is_active_column, ensure_prefs_table
    from auth.sessions import ensure_auth_sessions_table
    from routes.career_quest import ensure_career_quest_tables
    from routes.hr_notifications import ensure_notifications_table
    from routes.proctoring import ensure_proctoring_schema
    from routes.talent_arena import ensure_talent_arena_tables
    from services.auto_interview import (
        ensure_application_columns as ensure_send_method_column,
    )
    from services.auto_interview import ensure_prefs_columns
    from services.final_decision import ensure_decision_columns
    from services.resume_evaluation import ensure_resume_report_columns

    return (
        ("auth_sessions", ensure_auth_sessions_table),
        ("notifications", ensure_notifications_table),
        ("hr_notification_preferences", ensure_prefs_table),
        ("hr_users.is_active", ensure_is_active_column),
        ("hr_notification_preferences columns", lambda: ensure_prefs_columns(db_path)),
        (
            "applications.interview_code_send_method",
            lambda: ensure_send_method_column(db_path),
        ),
        ("applications decision columns", lambda: ensure_decision_columns(db_path)),
        ("resume_reports columns", lambda: ensure_resume_report_columns(db_path)),
        ("proctoring_violations", ensure_proctoring_schema),
        ("career_quest tables", ensure_career_quest_tables),
        ("talent_arena tables", ensure_talent_arena_tables),
    )


def _run_step(label: str, step, summary: dict, verbose: bool) -> None:
    """Run one additive schema step and record its outcome.

    A race with another worker that applied the same change first is reported as
    "already applied" rather than failing the startup: the schema is identical.
    Any other error is logged and re-raised so the deployment fails fast with a
    clear message instead of serving broken requests.
    """
    try:
        step()
    except sqlite3.OperationalError as exc:
        if any(marker in str(exc).lower() for marker in _ALREADY_APPLIED_MARKERS):
            logger.warning("Schema step %s was already applied elsewhere", label)
            summary["steps"].append((label, "already applied"))
            return
        logger.error("Schema step %s failed: %s", label, exc)
        raise
    summary["steps"].append((label, "ok"))
    if verbose:
        print(f"  OK  {label}")


def init_database(verbose: bool = False) -> dict:
    """Create every table, index and column the application needs.

    Idempotent and additive, so it is safe to call on every startup, against an
    existing database, and concurrently from several workers. Returns a summary
    dict (``db_path``, ``created_tables``, ``tables``, ``steps``), which is also
    printed when ``verbose`` is true.
    """
    _prepare_db_file(DB_PATH)

    conn = _connect(DB_PATH)
    try:
        created = create_base_schema(conn)
        tables = sorted(table_names(conn))
    finally:
        conn.close()

    summary = {
        "db_path": DB_PATH,
        "created_tables": created,
        "tables": tables,
        "steps": [],
    }

    if verbose:
        print(f"Database: {DB_PATH}")
        if created:
            print(f"  new tables: {', '.join(created)}")

    for label, step in _feature_schema_steps(DB_PATH):
        _run_step(label, step, summary, verbose)

    # Re-read once at the end: the feature steps create tables too.
    conn = _connect(DB_PATH)
    try:
        summary["tables"] = sorted(table_names(conn))
    finally:
        conn.close()

    if verbose:
        print(f"  tables present: {len(summary['tables'])}")
        for name in summary["tables"]:
            print(f"    - {name}")
    logger.info(
        "Database schema ready at %s (%d tables, %d created)",
        DB_PATH,
        len(summary["tables"]),
        len(created),
    )
    return summary


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    print("Initialising the MeLun database schema...\n")
    init_database(verbose=True)
    print("\nDatabase schema is ready")
