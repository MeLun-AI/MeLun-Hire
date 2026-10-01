import os
import sqlite3
import sys

# Resolve the database package relative to this file so the script works
# whether it is run from the project root or from Backend/3.Chat bot.
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
APP_ROOT = os.path.dirname(BASE_DIR)
for _path in (APP_ROOT, BASE_DIR):
    if _path not in sys.path:
        sys.path.insert(0, _path)

try:
    from database.db import DB_PATH
except ModuleNotFoundError:  # Fallback for legacy direct-database cwd usage
    DATABASE_DIR = os.path.join(APP_ROOT, "database")
    if DATABASE_DIR not in sys.path:
        sys.path.insert(0, DATABASE_DIR)
    from db import DB_PATH  # type: ignore[no-redef]

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

# ---------------- HR USERS ----------------
cur.execute("""
CREATE TABLE IF NOT EXISTS hr_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT NOT NULL,
    hr_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
)
""")

# ---------------- APPLICANTS ----------------
cur.execute("""
CREATE TABLE IF NOT EXISTS applicants (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    password TEXT NOT NULL,
    location TEXT,
    experience_years INTEGER,
    skills TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
)
""")

# ---------------- JOB POSTS ----------------
cur.execute("""
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
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
)
""")

# ---------------- APPLICATIONS ----------------
cur.execute("""
CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    applicant_id TEXT NOT NULL,
    job_id INTEGER NOT NULL,
    resume_status TEXT DEFAULT 'Pending',
    applied_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_seen TEXT,
    UNIQUE(applicant_id, job_id)
)
""")

# ---------------- RESUME REPORTS ----------------
cur.execute("""
CREATE TABLE IF NOT EXISTS resume_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER,
    matched BOOLEAN,
    matched_skills TEXT,
    resume_filename TEXT,
    created_at TEXT,
    FOREIGN KEY (application_id) REFERENCES applications(id)
)
""")

# ---------------- HR COMPANY PROFILE ----------------
cur.execute("""
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
""")

# ---------------- INTERVIEW REPORTS ----------------
cur.execute("""
CREATE TABLE IF NOT EXISTS interview_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL UNIQUE,
    domain TEXT NOT NULL,
    answers_json TEXT NOT NULL,
    analysis_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (application_id) REFERENCES applications(id)
)
""")

conn.commit()
conn.close()

print("✅ Base database initialized successfully")

# =================================================
# PERFORMANCE INDEXES (IMPORTANT FOR SCALE)
# =================================================

cur.execute("""
CREATE INDEX IF NOT EXISTS idx_applications_status
ON applications(interview_status)
""")

cur.execute("""
CREATE INDEX IF NOT EXISTS idx_applications_last_seen
ON applications(last_seen)
""")

cur.execute("""
CREATE INDEX IF NOT EXISTS idx_applications_job_id
ON applications(job_id)
""")

cur.execute("""
CREATE INDEX IF NOT EXISTS idx_applications_applicant
ON applications(applicant_id)
""")

cur.execute("""
CREATE INDEX IF NOT EXISTS idx_hr_job_posts_hr_id
ON hr_job_posts(hr_id)
""")
