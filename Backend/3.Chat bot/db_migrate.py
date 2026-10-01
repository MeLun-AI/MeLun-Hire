import sqlite3
import sys
import os

# Make the script location importable so the database package resolves the
# same way regardless of the current working directory (e.g. project root).
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

try:
    from database.db import DB_PATH
except ModuleNotFoundError:  # Fallback when run from inside Backend/3.Chat bot
    DATABASE_DIR = os.path.join(BASE_DIR, "database")
    if DATABASE_DIR not in sys.path:
        sys.path.insert(0, DATABASE_DIR)
    from db import DB_PATH  # type: ignore[no-redef]

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

print("🔧 Running database migrations...\n")

# ---------------- ENSURE APPLICATIONS TABLE ----------------
cur.execute("""
CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    applicant_id TEXT NOT NULL,
    job_id INTEGER NOT NULL,
    resume_status TEXT DEFAULT 'Pending',
    status TEXT DEFAULT 'pending',
    applied_at TEXT DEFAULT CURRENT_TIMESTAMP,
    interview_code TEXT,
    interview_status TEXT DEFAULT 'Not Started',
    interview_expires_at TEXT,
    UNIQUE(applicant_id, job_id)
)
""")
print("✅ applications table ensured")

# ---------------- CHECK COLUMNS ----------------
cur.execute("PRAGMA table_info(applications);")
existing_columns = {row[1] for row in cur.fetchall()}

def add_column(name, sql):
    if name not in existing_columns:
        cur.execute(sql)
        print(f"✅ {name} column added")
    else:
        print(f"ℹ️ {name} column already exists")

# ---------------- ADD MISSING COLUMNS ----------------
add_column(
    "applied_date",
    "ALTER TABLE applications ADD COLUMN applied_date TEXT"
)

# How the interview code for an application was delivered:
# 'automatic' (sent when a newly matched candidate applied with the HR's
# automatic interview codes switched on) or 'manual' (HR sent it). NULL means
# no code has been delivered yet.
add_column(
    "interview_code_send_method",
    "ALTER TABLE applications ADD COLUMN interview_code_send_method TEXT"
)

conn.commit()
conn.close()

print("\n🎉 Database migration complete")
