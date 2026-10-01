"""End-to-end smoke test for MATCHED + UNMATCHED applicant tracking.

Creates a temporary HR, two applicants and two job postings (with synthetic
resumes written to a temp resume directory), then exercises the full flow:

  A. matched apply      -> stored as `matched` + success response
  B. unmatched apply    -> stored as `unmatched` + real missing-skill gaps
  C. same candidate on two jobs -> independent statuses (never overwritten)
  D. duplicate apply    -> existing "Already applied to this job" rule kept
  E. HR applicants list -> returns BOTH groups with authoritative statuses
  F. HR resume report   -> View/report works for an unmatched application too
  G. tenant isolation   -> another HR sees none of it

Runs against a COPY of the SQLite database and a temporary resume directory, so
no development data is modified and no real candidate data is read or asserted
on - only the synthetic records created here are used. The optional LLM
refinement is disabled (no network calls); the deterministic engine decides.

Run:  python e2e_smoke_application_matching.py   (from Backend/3.Chat bot)
Exit code 0 = every check held, 1 = at least one FAIL.
"""
import json
import os
import shutil
import sqlite3
import sys
import tempfile
import uuid
from datetime import datetime

BACKEND = os.path.dirname(os.path.abspath(__file__))
if BACKEND not in sys.path:
    sys.path.insert(0, BACKEND)

# Development/test defaults: cookie may be non-Secure (http), debug off.
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("SESSION_COOKIE_SECURE", "false")
os.environ.setdefault("APP_DEBUG", "false")

REAL_DB = os.path.join(BACKEND, "database", "database.db")
TMP_DIR = tempfile.mkdtemp(prefix="quno_match_test_")
TMP_DB = os.path.join(TMP_DIR, "database.db")
TMP_RESUMES = os.path.join(TMP_DIR, "resumes")
shutil.copyfile(REAL_DB, TMP_DB)  # schema template; tests write only here

RESULTS = []

# Synthetic resumes: the first has real evidence for the platform job's
# required skills, the second has none of them (but does evidence the design
# job's skills), so each candidate lands in a different bucket per job.
PLATFORM_RESUME = """Alex Matcher - alex.matcher@example.com

Experience
Backend Developer at Acme Systems
Developed and deployed REST APIs in Python with SQL database optimization.
Built data pipelines and monitored production services.

Projects
Analytics web app built with Python, SQL and REST APIs.

Skills
Python, SQL, REST APIs

Education
Bachelor of Engineering in Computer Science
"""

DESIGN_RESUME = """Uma Unmatched - uma.unmatched@example.com

Experience
Brand Designer at Pixel Studio
Designed brand systems in Photoshop and Illustrator for 30+ clients.
Managed print production and art direction for campaigns.

Skills
Photoshop, Illustrator, Branding

Education
Bachelor of Fine Arts
"""

def record(name, expected, actual, ok):
    RESULTS.append((name, expected, actual, ok))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}: expected={expected} actual={actual}")


def patch_db_paths():
    """Point every module that talks to SQLite/resumes at the temp copy."""
    import main as main_mod
    import auth.sessions as sessions_mod
    import auth.routes.applicant_auth as applicant_auth_mod
    import auth.routes.hr_applicants as hr_applicants_mod
    import routes.hr_notifications as notifications_mod
    import services.resume_evaluation as evaluation_mod
    import database.db as db_mod
    from config.settings import settings

    for mod in (
        main_mod, sessions_mod, applicant_auth_mod, hr_applicants_mod,
        notifications_mod,
    ):
        if hasattr(mod, "DB_PATH"):
            mod.DB_PATH = TMP_DB
    db_mod.DB_PATH = TMP_DB

    # Resumes + the optional LLM refinement are redirected/disabled so the test
    # stays deterministic and never touches real files or the network.
    evaluation_mod.RESUME_DIR = TMP_RESUMES
    hr_applicants_mod.RESUME_DIR = TMP_RESUMES
    settings.OPENAI_API_KEY = ""

    sessions_mod._table_ready = False
    sessions_mod.ensure_auth_sessions_table()
    # The temp copy is taken before `import main` runs its safe migrations, so
    # re-apply them against the copy (additive, idempotent).
    main_mod.ensure_application_columns()
    main_mod.ensure_interview_report_columns()


def _write_resume(applicant_id, filename, resume_text):
    folder = os.path.join(TMP_RESUMES, applicant_id)
    os.makedirs(folder, exist_ok=True)
    with open(os.path.join(folder, filename), "w", encoding="utf-8") as f:
        f.write(resume_text)
    with open(os.path.join(folder, "analysis.json"), "w", encoding="utf-8") as f:
        json.dump({
            "filename": filename,
            "stored_name": filename,
            "resume_text": resume_text,
            "created_at": datetime.utcnow().isoformat(),
        }, f)


def seed_synthetic_data():
    """Create one HR, two applicants (each with a resume) and two jobs."""
    conn = sqlite3.connect(TMP_DB, isolation_level=None)
    cur = conn.cursor()
    tag = uuid.uuid4().hex[:6]
    password = "TestPass!2345"

    from utils.security import hash_password

    pw_hash = hash_password(password)

    emails = {
        "hr_email": f"match.hr.{tag}@example.com",
        "hr_other_email": f"match.hr.other.{tag}@example.com",
        "matcher_email": f"match.cand.{tag}@example.com",
        "designer_email": f"match.design.{tag}@example.com",
    }

    def insert(table, values):
        cols = list(values.keys())
        cur.execute(
            f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})",
            [values[c] for c in cols],
        )
        return cur.lastrowid

    hr_id = insert("hr_users", {
        "company_name": f"Match Co {tag}", "hr_name": "Match HR",
        "email": emails["hr_email"], "password_hash": pw_hash,
    })
    hr_other_id = insert("hr_users", {
        "company_name": f"Other Co {tag}", "hr_name": "Other HR",
        "email": emails["hr_other_email"], "password_hash": pw_hash,
    })

    matcher_id = f"CAND-M-{tag.upper()}"
    designer_id = f"CAND-D-{tag.upper()}"
    now = datetime.utcnow().isoformat()

    insert("applicants", {
        "id": matcher_id, "full_name": "Synthetic Matcher",
        "email": emails["matcher_email"], "phone": "0000000000",
        "password": pw_hash, "location": "Test", "experience_years": 4,
        "skills": "Python, SQL, REST APIs", "created_at": now,
    })
    insert("applicants", {
        "id": designer_id, "full_name": "Synthetic Designer",
        "email": emails["designer_email"], "phone": "0000000001",
        "password": pw_hash, "location": "Test", "experience_years": 4,
        "skills": "Photoshop, Illustrator, Branding", "created_at": now,
    })

    _write_resume(matcher_id, "matcher_resume.txt", PLATFORM_RESUME)
    _write_resume(designer_id, "designer_resume.txt", DESIGN_RESUME)

    platform_job = insert("hr_job_posts", {
        "hr_id": hr_id, "job_title": f"Data Platform Engineer {tag}",
        "job_domain": "Data Science", "job_type": "Full-time",
        "job_mode": "Remote", "experience_required": "2 years",
        "location": "Test", "description": "Build and ship the data platform.",
        "status": "Open", "created_at": now,
        "required_skills": "Python, SQL, REST APIs",
        "preferred_skills": "Docker",
        "responsibilities": "Build data pipelines, Design database schemas",
    })
    design_job = insert("hr_job_posts", {
        "hr_id": hr_id, "job_title": f"Brand Designer {tag}",
        "job_domain": "Creative", "job_type": "Full-time",
        "job_mode": "Remote", "experience_required": "2 years",
        "location": "Test", "description": "Own the brand visual system.",
        "status": "Open", "created_at": now,
        "required_skills": "Photoshop, Illustrator",
        "preferred_skills": "",
        "responsibilities": "Design brand systems, Illustrate marketing assets",
    })

    conn.commit()
    conn.close()

    return {
        "password": password,
        **emails,
        "hr_id": hr_id,
        "hr_other_id": hr_other_id,
        "matcher_id": matcher_id,
        "designer_id": designer_id,
        "platform_job": platform_job,
        "design_job": design_job,
    }


def main():
    patch_db_paths()
    ids = seed_synthetic_data()

    from fastapi.testclient import TestClient
    import main as main_mod

    client = TestClient(main_mod.app)

    def login(path, email):
        res = client.post(path, json={"email": email, "password": ids["password"]})
        body = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
        return res.status_code, body

    print("--- 0. Synthetic principals authenticate ---")
    st, hr = login("/hr/login", ids["hr_email"])
    record("HR login", 200, st, st == 200)
    st, hr_other = login("/hr/login", ids["hr_other_email"])
    record("Other HR login", 200, st, st == 200)
    st, matcher = login("/applicant/login", ids["matcher_email"])
    record("Matcher login", 200, st, st == 200)
    st, designer = login("/applicant/login", ids["designer_email"])
    record("Designer login", 200, st, st == 200)

    A = {"Authorization": f"Bearer {matcher.get('auth_token', '')}"}
    B = {"Authorization": f"Bearer {designer.get('auth_token', '')}"}
    HR = {"Authorization": f"Bearer {hr.get('auth_token', '')}"}
    HRO = {"Authorization": f"Bearer {hr_other.get('auth_token', '')}"}

    def apply(headers, applicant_id, job_id):
        return client.post(
            "/applicant/apply",
            json={"applicant_id": applicant_id, "job_id": job_id},
            headers=headers,
        )

    print("\n--- 1. Test A: matching candidate applies -> stored as matched ---")
    res = apply(A, ids["matcher_id"], ids["platform_job"])
    body = res.json() if res.status_code == 200 else {}
    record("Matcher apply returns 200", 200, res.status_code, res.status_code == 200)
    record("Matcher apply response status", "matched", body.get("match_status"),
           body.get("match_status") == "matched")
    record("Matcher apply keeps success flag", True, body.get("success"), body.get("success") is True)
    matcher_platform_score = body.get("match_score")

    print("\n--- 2. Test B: non-matching candidate applies -> stored as unmatched ---")
    res = apply(B, ids["designer_id"], ids["platform_job"])
    body = res.json() if res.status_code == 200 else {}
    record("Designer apply returns 200", 200, res.status_code, res.status_code == 200)
    record("Designer apply response status", "unmatched", body.get("match_status"),
           body.get("match_status") == "unmatched")
    missing = body.get("missing_skills") or []
    record("Designer gaps reported in the apply response", True, missing, len(missing) > 0)
    designer_platform_score = body.get("match_score")

    print("\n--- 3. Test C: the same candidates on a second job ---")
    res = apply(A, ids["matcher_id"], ids["design_job"])
    body = res.json() if res.status_code == 200 else {}
    record("Matcher on design job is unmatched", "unmatched", body.get("match_status"),
           body.get("match_status") == "unmatched")
    res = apply(B, ids["designer_id"], ids["design_job"])
    body = res.json() if res.status_code == 200 else {}
    record("Designer on design job is matched", "matched", body.get("match_status"),
           body.get("match_status") == "matched")

    print("\n--- 4. Test D: duplicate apply keeps the existing rule ---")
    res = apply(A, ids["matcher_id"], ids["platform_job"])
    payload = res.json() if res.status_code else {}
    detail = payload.get("detail") if isinstance(payload, dict) else None
    record("Duplicate apply rejected", 400, res.status_code, res.status_code == 400)
    record("Duplicate apply message", "Already applied to this job", detail,
           detail == "Already applied to this job")

    conn = sqlite3.connect(TMP_DB)
    total_matcher_platform = conn.execute(
        "SELECT COUNT(*) FROM applications WHERE applicant_id = ? AND job_id = ?",
        (ids["matcher_id"], ids["platform_job"]),
    ).fetchone()[0]
    stored_status = conn.execute(
        "SELECT match_status FROM applications WHERE applicant_id = ? AND job_id = ?",
        (ids["matcher_id"], ids["platform_job"]),
    ).fetchone()[0]
    stored_missing = conn.execute(
        "SELECT match_missing_skills FROM applications WHERE applicant_id = ? AND job_id = ?",
        (ids["designer_id"], ids["platform_job"]),
    ).fetchone()[0]
    conn.close()
    record("No duplicate application row created", 1, total_matcher_platform,
           total_matcher_platform == 1)
    record("Match status persisted on the application", "matched", stored_status,
           stored_status == "matched")
    record("Missing skills persisted for the unmatched attempt", True, stored_missing,
           bool(stored_missing))


    print("\n--- 5. Test E: HR applicants list returns BOTH groups ---")
    res = client.get(f"/hr/applicants/{ids['hr_id']}", headers=HR)
    rows = res.json() if res.status_code == 200 else []
    record("HR list returns 200", 200, res.status_code, res.status_code == 200)
    record("HR list returns every attempt", 4, len(rows), len(rows) == 4)

    conn = sqlite3.connect(TMP_DB)
    platform_title = conn.execute(
        "SELECT job_title FROM hr_job_posts WHERE id = ?", (ids["platform_job"],)
    ).fetchone()[0]
    design_title = conn.execute(
        "SELECT job_title FROM hr_job_posts WHERE id = ?", (ids["design_job"],)
    ).fetchone()[0]
    conn.close()

    by_key = {(r.get("applicant_id"), r.get("job_title")): r for r in rows}

    def status_of(applicant_id, title):
        return (by_key.get((applicant_id, title)) or {}).get("match_status")

    record("Matcher -> platform job is matched", "matched",
           status_of(ids["matcher_id"], platform_title),
           status_of(ids["matcher_id"], platform_title) == "matched")
    record("Matcher -> design job is unmatched", "unmatched",
           status_of(ids["matcher_id"], design_title),
           status_of(ids["matcher_id"], design_title) == "unmatched")
    record("Designer -> platform job is unmatched", "unmatched",
           status_of(ids["designer_id"], platform_title),
           status_of(ids["designer_id"], platform_title) == "unmatched")
    record("Designer -> design job is matched", "matched",
           status_of(ids["designer_id"], design_title),
           status_of(ids["designer_id"], design_title) == "matched")

    matched_rows = [r for r in rows if r.get("match_status") == "matched"]
    unmatched_rows = [r for r in rows if r.get("match_status") == "unmatched"]
    record("Matched count", 2, len(matched_rows), len(matched_rows) == 2)
    record("Unmatched count", 2, len(unmatched_rows), len(unmatched_rows) == 2)

    unmatched_row = by_key.get((ids["designer_id"], platform_title)) or {}
    record("Unmatched row keeps candidate identity", True,
           (unmatched_row.get("full_name"), bool(unmatched_row.get("email"))),
           bool(unmatched_row.get("full_name")) and bool(unmatched_row.get("email")))
    record("Unmatched row keeps the job it was for", platform_title,
           unmatched_row.get("job_title"), unmatched_row.get("job_title") == platform_title)
    record("Unmatched row keeps the match score", designer_platform_score,
           unmatched_row.get("match_score"),
           unmatched_row.get("match_score") == designer_platform_score)
    record("Unmatched row keeps the missing skills", True,
           unmatched_row.get("match_missing_skills"),
           bool(unmatched_row.get("match_missing_skills")))
    record("Unmatched row keeps the resume", "designer_resume.txt",
           unmatched_row.get("resume_filename"),
           unmatched_row.get("resume_filename") == "designer_resume.txt")


    print("\n--- 6. Test F: View/report works for an unmatched application ---")
    unmatched_app_id = unmatched_row.get("application_id")
    res = client.get(f"/hr/resume-report/{unmatched_app_id}", headers=HR)
    report = res.json() if res.status_code == 200 else {}
    record("Unmatched report returns 200", 200, res.status_code, res.status_code == 200)
    record("Unmatched report matched flag", False, report.get("matched"),
           report.get("matched") is False)
    report_score = (report.get("report") or {}).get("match_score")
    record("Unmatched report agrees with the stored score", designer_platform_score,
           report_score, report_score == designer_platform_score)
    gaps = (report.get("report") or {}).get("gaps") or []
    record("Unmatched report lists requirement gaps", True, gaps[:2], len(gaps) > 0)
    missing_entries = [
        e["skill"]
        for e in (report.get("report") or {}).get("required_skills", [])
        if e.get("status") == "missing"
    ]
    record("Unmatched report lists missing skills", True, missing_entries,
           len(missing_entries) > 0)

    matched_app_id = (by_key.get((ids["matcher_id"], platform_title)) or {}).get("application_id")
    res = client.get(f"/hr/resume-report/{matched_app_id}", headers=HR)
    matched_report = res.json() if res.status_code == 200 else {}
    record("Matched report still works (regression)", True, matched_report.get("matched"),
           matched_report.get("matched") is True)
    record("Matched report agrees with the stored score", matcher_platform_score,
           (matched_report.get("report") or {}).get("match_score"),
           (matched_report.get("report") or {}).get("match_score") == matcher_platform_score)

    print("\n--- 7. Test G: authorization is unchanged for the new status ---")
    res = client.get(f"/hr/applicants/{ids['hr_other_id']}", headers=HRO)
    other_rows = res.json() if res.status_code == 200 else None
    record("Other HR sees no rows", 0, other_rows, other_rows == [])
    res = client.get(f"/hr/resume-report/{unmatched_app_id}", headers=HRO)
    record("Other HR cannot read the unmatched report", 404, res.status_code,
           res.status_code == 404)

    print("\n--- 8. Match status is per attempt, never a global candidate status ---")
    conn = sqlite3.connect(TMP_DB)
    statuses = dict(conn.execute(
        "SELECT job_id, match_status FROM applications WHERE applicant_id = ?",
        (ids["matcher_id"],),
    ).fetchall())
    conn.close()
    record("One attempt row per job", 2, len(statuses), len(statuses) == 2)
    record("Same candidate has both statuses across jobs", 2, len(set(statuses.values())),
           len(set(statuses.values())) == 2)

    failures = [r for r in RESULTS if not r[3]]
    print("\n" + "=" * 60)
    print(f"{len(RESULTS) - len(failures)}/{len(RESULTS)} checks passed")
    if failures:
        print("FAILED CHECKS:")
        for name, expected, actual, _ in failures:
            print(f"  - {name}: expected={expected} actual={actual}")
    print("=" * 60)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
