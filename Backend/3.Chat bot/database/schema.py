"""Canonical SQLite schema for MeLun Hire.

This module is the single source of truth for the tables/columns that must
exist before the API can answer a single request. It exists so that a fresh
deployment (new Railway/Render container, empty persistent volume, no
``database.db`` file) initialises itself instead of failing at the first query
with ``sqlite3.OperationalError: no such table: ...``.

Nothing here drops or rewrites data:

* Every table is ``CREATE TABLE IF NOT EXISTS`` — an existing table is left
  exactly as it is.
* ``BASE_COLUMN_MIGRATIONS`` only ever *adds* columns, and only when the
  ``PRAGMA table_info`` check shows the column is missing.

Tables owned by a specific feature (notifications, auth sessions, HR
notification preferences, proctoring violations, Career Quest, Talent Arena)
keep their DDL in the module that owns them; ``database/init_db.py`` calls
those guards so their definitions are not duplicated here.
"""

import sqlite3

# ---------------------------------------------------------------------------
# Base tables
# ---------------------------------------------------------------------------
# Column sets match the schema the running application expects, including the
# columns that older databases received through the additive ``ensure_*``
# guards, so a brand new file is immediately complete.

BASE_TABLES = (
    # ---------------- HR USERS ----------------
    """
    CREATE TABLE IF NOT EXISTS hr_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_name TEXT NOT NULL,
        hr_name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        is_active INTEGER DEFAULT 1
    )
    """,
    # ---------------- APPLICANTS ----------------
    """
    CREATE TABLE IF NOT EXISTS applicants (
        id TEXT PRIMARY KEY,
        full_name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT,
        password TEXT NOT NULL,
        location TEXT,
        experience_years INTEGER,
        skills TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        profile_pic TEXT
    )
    """,
    # ---------------- JOB POSTS ----------------
    """
    CREATE TABLE IF NOT EXISTS hr_job_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hr_id INTEGER NOT NULL,
        job_title TEXT NOT NULL,
        job_domain TEXT,
        job_type TEXT,
        job_mode TEXT,
        experience_required TEXT,
        location TEXT,
        description TEXT,
        status TEXT DEFAULT 'Open',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        salary TEXT,
        deadline TEXT,
        required_skills TEXT,
        preferred_skills TEXT,
        responsibilities TEXT,
        company_overview TEXT,
        benefits TEXT,
        hiring_process TEXT,
        recruiter_notes TEXT
    )
    """,
    # ---------------- APPLICATIONS ----------------
    """
    CREATE TABLE IF NOT EXISTS applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        applicant_id TEXT NOT NULL,
        job_id INTEGER NOT NULL,
        resume_status TEXT DEFAULT 'Pending',
        status TEXT DEFAULT 'pending',
        applied_at TEXT DEFAULT CURRENT_TIMESTAMP,
        applied_date TEXT,
        interview_code TEXT,
        interview_status TEXT DEFAULT 'Not Started',
        interview_expires_at TEXT,
        interview_code_send_method TEXT,
        reissue_requested INTEGER DEFAULT 0,
        reissue_count INTEGER DEFAULT 0,
        last_seen TEXT,
        interview_started_at TEXT,
        interview_completed_at TEXT,
        code_email_sent INTEGER DEFAULT 0,
        match_status TEXT,
        match_score INTEGER,
        match_missing_skills TEXT,
        final_decision TEXT,
        final_decision_source TEXT,
        final_decision_score INTEGER,
        final_decision_at TEXT,
        decision_email_sent INTEGER DEFAULT 0,
        UNIQUE(applicant_id, job_id)
    )
    """,
    # ---------------- RESUME REPORTS ----------------
    """
    CREATE TABLE IF NOT EXISTS resume_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        application_id INTEGER,
        matched BOOLEAN,
        matched_skills TEXT,
        resume_filename TEXT,
        created_at TEXT,
        evaluation_json TEXT,
        source_hash TEXT,
        last_evaluated_at TEXT,
        FOREIGN KEY (application_id) REFERENCES applications(id)
    )
    """,
    # ---------------- HR COMPANY PROFILE ----------------
    """
    CREATE TABLE IF NOT EXISTS hr_company_profile (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hr_id TEXT UNIQUE NOT NULL,
        company_name TEXT,
        hr_name TEXT,
        company_email TEXT,
        company_location TEXT,
        company_website TEXT,
        company_linkedin TEXT,
        company_instagram TEXT,
        company_size TEXT,
        about_company TEXT
    )
    """,
    # ---------------- INTERVIEW REPORTS ----------------
    """
    CREATE TABLE IF NOT EXISTS interview_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        application_id INTEGER NOT NULL UNIQUE,
        domain TEXT NOT NULL,
        answers_json TEXT NOT NULL,
        analysis_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        applicant_id TEXT,
        FOREIGN KEY (application_id) REFERENCES applications(id)
    )
    """,
)

# ---------------------------------------------------------------------------
# Password reset
# ---------------------------------------------------------------------------

# One-time codes used by the legacy reset flow in ``main.py``.
PASSWORD_RESET_OTP_TABLE_SQL = """
    CREATE TABLE IF NOT EXISTS password_reset (
        email TEXT,
        otp TEXT,
        role TEXT,
        created_at TEXT
    )
"""

# Token based flow used by ``routes/password_reset.py``.
PASSWORD_RESET_TOKENS_TABLE_SQL = """
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('hr', 'applicant')),
        token_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
"""

PASSWORD_RESET_TABLES = (
    PASSWORD_RESET_OTP_TABLE_SQL,
    PASSWORD_RESET_TOKENS_TABLE_SQL,
)

# ---------------------------------------------------------------------------
# Indexes for the base tables
# ---------------------------------------------------------------------------

BASE_INDEXES = (
    "CREATE INDEX IF NOT EXISTS idx_applications_status "
    "ON applications(interview_status)",
    "CREATE INDEX IF NOT EXISTS idx_applications_last_seen "
    "ON applications(last_seen)",
    "CREATE INDEX IF NOT EXISTS idx_applications_job_id "
    "ON applications(job_id)",
    "CREATE INDEX IF NOT EXISTS idx_applications_applicant "
    "ON applications(applicant_id)",
    "CREATE INDEX IF NOT EXISTS idx_hr_job_posts_hr_id "
    "ON hr_job_posts(hr_id)",
    "CREATE INDEX IF NOT EXISTS idx_reset_tokens_email "
    "ON password_reset_tokens(email)",
    "CREATE INDEX IF NOT EXISTS idx_reset_tokens_token_hash "
    "ON password_reset_tokens(token_hash)",
)

# ---------------------------------------------------------------------------
# Additive columns for databases created by an older build
# ---------------------------------------------------------------------------
# ``CREATE TABLE IF NOT EXISTS`` cannot add a column to a table that already
# exists, so these guards keep existing databases (local dev copy, an already
# provisioned production volume) in sync without a rebuild.
#
# Only columns that no other module owns are listed here: the remaining
# additive columns on the base tables are applied by their owning module
# (``hr_settings.ensure_is_active_column``, ``hr_job_posts.ensure_job_columns``,
# ``main.ensure_application_columns``, ``main.ensure_interview_report_columns``,
# ``resume_evaluation.ensure_resume_report_columns``).

BASE_COLUMN_MIGRATIONS = {
    "applicants": {"profile_pic": "TEXT"},
}


def table_names(conn):
    """Names of the user tables that currently exist in the database."""
    return {
        row[0]
        for row in conn.execute(
            "SELECT name FROM sqlite_master "
            "WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
        )
    }


def ensure_columns(conn: sqlite3.Connection, table: str, columns: dict) -> list:
    """Add missing columns to an existing table. Returns the names added.

    ``columns`` maps a column name to its SQLite column definition, e.g.
    ``{"profile_pic": "TEXT"}``. Existing columns and all data are untouched.
    """
    existing = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
    added = []
    for name, definition in columns.items():
        if name not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")
            added.append(name)
    return added


def create_base_schema(conn: sqlite3.Connection) -> list:
    """Create every base table, index and additive column.

    Runs as one transaction so a crash cannot leave the schema half applied.
    Idempotent and safe to run concurrently (the write lock is taken up front).
    Returns the names of the tables that did not exist before the call.
    """
    before = table_names(conn)
    conn.execute("BEGIN IMMEDIATE")
    try:
        for statement in BASE_TABLES:
            conn.execute(statement)
        for statement in PASSWORD_RESET_TABLES:
            conn.execute(statement)
        for table, columns in BASE_COLUMN_MIGRATIONS.items():
            ensure_columns(conn, table, columns)
        for statement in BASE_INDEXES:
            conn.execute(statement)
    except Exception:
        conn.rollback()
        raise
    conn.commit()
    return sorted(table_names(conn) - before)

