"""End-to-end smoke test for AUTOMATIC INTERVIEW CODES for matched candidates.

Creates a temporary HR, synthetic applicants and synthetic job postings (with
synthetic resumes written to a temp resume directory), then exercises every
scenario from the spec:

  1. auto OFF            -> matched candidate gets NO code; HR sends manually
  2. auto ON             -> newly matched candidate is emailed automatically
  3. auto ON + unmatched -> unmatched attempt never triggers a code
  4. toggle OFF          -> future matches stop; existing sent state is kept
  5. duplicate prevention -> refreshes / retries / re-sends never duplicate
  6. existing candidate  -> turning the switch ON never mass-sends
  7. delivery failure    -> honestly not marked sent; manual retry still works
  8. persistence         -> the switch survives a fresh login session
  9. security            -> another HR can neither read nor change it

Runs against a COPY of the SQLite database and a temporary resume directory, so
no development data is modified and no real candidate data is read or asserted
on - only the synthetic records created here are used. Email delivery is stubbed
(no network, no SMTP); the deterministic matching engine decides the buckets.

Run:  python e2e_smoke_auto_interview_codes.py   (from Backend/3.Chat bot)
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
TMP_DIR = tempfile.mkdtemp(prefix="quno_auto_code_test_")
TMP_DB = os.path.join(TMP_DIR, "database.db")
TMP_RESUMES = os.path.join(TMP_DIR, "resumes")
shutil.copyfile(REAL_DB, TMP_DB)  # schema template; tests write only here

RESULTS = []

# Synthetic resumes: one has real evidence for the platform job's required
# skills, the other has none of them (but evidences the design job's skills).
PLATFORM_RESUME = """Alex Matcher - alex.matcher@example.com

Experience
Backend Developer at Acme Systems
Developed and deployed REST APIs in Python with SQL database optimization.
Built data pipelines and monitored production services.

Skills
Python, SQL, REST APIs

Education
Bachelor of Engineering in Computer Science
"""

DESIGN_RESUME = """Uma Unmatched - uma.unmatched@example.com

Experience
Brand Designer at Pixel Studio
Designed brand systems in Photoshop and Illustrator for 30+ clients.

Skills
Photoshop, Illustrator, Branding

Education
Bachelor of Fine Arts
"""

# Stubbed delivery: records what would have been emailed, and can be forced to
# fail so the honest-failure path can be verified.
SENT = []
FAIL = {"on": False}


def fake_send_interview_email(to_email, code, job_domain):
    if FAIL["on"]:
        raise RuntimeError("synthetic SMTP failure")
    SENT.append({"to": to_email, "code": code, "domain": job_domain})


def sent_count_for(email):
    return len([s for s in SENT if s["to"] == email])


def record(name, expected, actual, ok):
    RESULTS.append((name, expected, actual, ok))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}: expected={expected} actual={actual}")


def patch_db_paths():
    """Point every module that talks to SQLite/resumes at the temp copy."""
    import main as main_mod
    import auth.sessions as sessions_mod
    import auth.routes.applicant_auth as applicant_auth_mod
    import auth.routes.hr_applicants as hr_applicants_mod
    import auth.routes.hr_settings as hr_settings_mod
    import routes.hr_notifications as notifications_mod
    import services.resume_evaluation as evaluation_mod
    import services.auto_interview as auto_interview_mod
    import database.db as db_mod
    from config.settings import settings

    for mod in (
        main_mod, sessions_mod, applicant_auth_mod, hr_applicants_mod,
        hr_settings_mod, notifications_mod, auto_interview_mod,
    ):
        if hasattr(mod, "DB_PATH"):
            mod.DB_PATH = TMP_DB
    db_mod.DB_PATH = TMP_DB

    # Resumes + the optional LLM refinement are redirected/disabled so the test
    # stays deterministic and never touches real files or the network.
    evaluation_mod.RESUME_DIR = TMP_RESUMES
    hr_applicants_mod.RESUME_DIR = TMP_RESUMES
    settings.OPENAI_API_KEY = ""

    # No SMTP: the shared interview-code service delivers through this function.
    main_mod.send_interview_email = fake_send_interview_email

    sessions_mod._table_ready = False
    sessions_mod.ensure_auth_sessions_table()
    # The temp copy is taken before `import main` runs its safe migrations, so
    # re-apply them against the copy (additive, idempotent).
    main_mod.ensure_application_columns()
    main_mod.ensure_interview_report_columns()
    auto_interview_mod.ensure_prefs_columns(TMP_DB)
    auto_interview_mod.ensure_application_columns(TMP_DB)


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
    """Create two HRs, two applicants (each with a resume) and five jobs."""
    conn = sqlite3.connect(TMP_DB, isolation_level=None)
    cur = conn.cursor()
    tag = uuid.uuid4().hex[:6]
    password = "TestPass!2345"

    from utils.security import hash_password

    pw_hash = hash_password(password)

    emails = {
        "hr_email": f"auto.hr.{tag}@example.com",
        "hr_other_email": f"auto.hr.other.{tag}@example.com",
        "matcher_email": f"auto.cand.{tag}@example.com",
        "designer_email": f"auto.design.{tag}@example.com",
    }

    def insert(table, values):
        cols = list(values.keys())
        cur.execute(
            f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})",
            [values[c] for c in cols],
        )
        return cur.lastrowid

    def insert_job(hr_id, title, domain, required, preferred, responsibilities, now):
        return insert("hr_job_posts", {
            "hr_id": hr_id, "job_title": f"{title} {tag}", "job_domain": domain,
            "job_type": "Full-time", "job_mode": "Remote",
            "experience_required": "2 years", "location": "Test",
            "description": f"Synthetic {title} role.", "status": "Open",
            "created_at": now, "required_skills": required,
            "preferred_skills": preferred, "responsibilities": responsibilities,
        })

    hr_id = insert("hr_users", {
        "company_name": f"Auto Co {tag}", "hr_name": "Auto HR",
        "email": emails["hr_email"], "password_hash": pw_hash,
    })
    hr_other_id = insert("hr_users", {
        "company_name": f"Other Co {tag}", "hr_name": "Other HR",
        "email": emails["hr_other_email"], "password_hash": pw_hash,
    })

    matcher_id = f"CAND-A-{tag.upper()}"
    designer_id = f"CAND-B-{tag.upper()}"
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

    # Jobs are created before the connection is closed.
    jobs = {
        "platform_job": insert_job(
            hr_id, "Data Platform Engineer", "Engineering",
            "Python, SQL, REST APIs", "Docker",
            "Build data pipelines, Design database schemas", now,
        ),
        "design_job": insert_job(
            hr_id, "Brand Designer", "Creative",
            "Photoshop, Illustrator", "",
            "Design brand systems, Illustrate marketing assets", now,
        ),
        "existing_job": insert_job(
            hr_id, "Backend Engineer", "Engineering",
            "Python, SQL", "", "Build backend services", now,
        ),
        "later_job": insert_job(
            hr_id, "API Engineer", "Engineering",
            "Python, SQL", "", "Build APIs", now,
        ),
        "fail_job": insert_job(
            hr_id, "Service Engineer", "Engineering",
            "Python, SQL", "", "Run services", now,
        ),
    }

    conn.commit()
    conn.close()

    return {
        "password": password,
        **emails,
        "hr_id": hr_id,
        "hr_other_id": hr_other_id,
        "matcher_id": matcher_id,
        "designer_id": designer_id,
        **jobs,
    }


def db_app_row(applicant_id, job_id):
    """Return (id, match_status, interview_code, code_email_sent, method)."""
    conn = sqlite3.connect(TMP_DB)
    try:
        return conn.execute(
            "SELECT id, match_status, interview_code, code_email_sent, "
            "interview_code_send_method FROM applications "
            "WHERE applicant_id = ? AND job_id = ?",
            (applicant_id, job_id),
        ).fetchone()
    finally:
        conn.close()


def main():
    patch_db_paths()
    ids = seed_synthetic_data()

    from fastapi.testclient import TestClient
    import main as main_mod

    client = TestClient(main_mod.app)
    HR_SETTING = f"/hr/auto-interview-codes/{ids['hr_id']}"

    def login(path, email):
        res = client.post(path, json={"email": email, "password": ids["password"]})
        body = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
        return res.status_code, body

    def apply(headers, applicant_id, job_id):
        return client.post(
            "/applicant/apply",
            json={"applicant_id": applicant_id, "job_id": job_id},
            headers=headers,
        )

    def list_rows(headers):
        res = client.get(f"/hr/applicants/{ids['hr_id']}", headers=headers)
        rows = res.json() if res.status_code == 200 else []
        return res.status_code, {(r["applicant_id"], r["job_title"]): r for r in rows}

    def get_setting(headers):
        res = client.get(HR_SETTING, headers=headers)
        body = res.json() if res.status_code == 200 else {}
        return res.status_code, body.get("auto_interview_codes")

    def set_setting(headers, enabled):
        return client.post(
            "/hr/auto-interview-codes",
            json={"enabled": enabled, "hr_id": ids["hr_id"]},
            headers=headers,
        )

    def manual_send(headers, application_id, job_domain):
        return client.post(
            "/hr/applicant/interview-code",
            json={
                "application_id": application_id,
                "job_domain": job_domain,
                "hr_id": ids["hr_id"],
            },
            headers=headers,
        )

    print("--- 0. Synthetic principals authenticate; switch defaults to OFF ---")
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

    st, enabled = get_setting(HR)
    record("Setting is readable", 200, st, st == 200)
    record("Setting defaults to OFF", False, enabled, enabled is False)

    print("\n--- 1. Test 1: auto OFF -> matched candidate gets NO code ---")
    res = apply(A, ids["matcher_id"], ids["platform_job"])
    body = res.json() if res.status_code == 200 else {}
    record("Matched apply returns 200", 200, res.status_code, res.status_code == 200)
    record("Application is matched", "matched", body.get("match_status"),
           body.get("match_status") == "matched")
    row = db_app_row(ids["matcher_id"], ids["platform_job"])
    platform_app_id = row[0]
    record("No automatic email while OFF", 0, sent_count_for(ids["matcher_email"]),
           sent_count_for(ids["matcher_email"]) == 0)
    record("Application stored as not sent", 0, row[3], row[3] == 0)
    record("Application has no delivery method", None, row[4], not row[4])

    st, rows = list_rows(HR)
    platform_title = next(
        (k[1] for k in rows if k[0] == ids["matcher_id"] and k[1].startswith("Data Platform")),
        None,
    )
    row_ui = rows.get((ids["matcher_id"], platform_title), {})
    record("HR list shows not sent", 0, row_ui.get("code_email_sent"),
           row_ui.get("code_email_sent") == 0)
    record("HR list shows no method", None, row_ui.get("code_send_method"),
           not row_ui.get("code_send_method"))
    record("HR list shows matched", "matched", row_ui.get("match_status"),
           row_ui.get("match_status") == "matched")

    print("\n--- 1b. HR can still send manually while auto is OFF ---")
    res = manual_send(HR, platform_app_id, "Engineering")
    mbody = res.json() if res.status_code == 200 else {}
    record("Manual send returns 200", 200, res.status_code, res.status_code == 200)
    record("Manual send reports delivery", 1, mbody.get("code_email_sent"),
           mbody.get("code_email_sent") == 1)
    record("Manual send records the method", "manual", mbody.get("code_send_method"),
           mbody.get("code_send_method") == "manual")
    row = db_app_row(ids["matcher_id"], ids["platform_job"])
    record("Manual delivery persisted", (1, "manual"), (row[3], row[4]),
           row[3] == 1 and row[4] == "manual")
    record("Exactly one email for the candidate", 1, sent_count_for(ids["matcher_email"]),
           sent_count_for(ids["matcher_email"]) == 1)

    print("\n--- 2. Test 6: an already matched candidate is not mass-emailed ---")
    res = apply(A, ids["matcher_id"], ids["existing_job"])
    record("Second matched application created", 200, res.status_code, res.status_code == 200)
    record("Still no automatic email while OFF", 1, sent_count_for(ids["matcher_email"]),
           sent_count_for(ids["matcher_email"]) == 1)
    existing_app_id = db_app_row(ids["matcher_id"], ids["existing_job"])[0]

    res = set_setting(HR, True)
    sbody = res.json() if res.status_code == 200 else {}
    record("Switch can be turned ON", True, sbody.get("auto_interview_codes"),
           sbody.get("auto_interview_codes") is True)
    st, enabled = get_setting(HR)
    record("Switch persisted as ON", True, enabled, enabled is True)

    # Repeated page loads / API calls must not back-fill codes.
    for _ in range(3):
        list_rows(HR)
    row = db_app_row(ids["matcher_id"], ids["existing_job"])
    record("Pre-existing match keeps no code", (0, None), (row[3], row[4]),
           row[3] == 0 and not row[4])
    record("Refreshing sends nothing", 1, sent_count_for(ids["matcher_email"]),
           sent_count_for(ids["matcher_email"]) == 1)
    record("Pre-existing match stays manually sendable", 0,
           db_app_row(ids["matcher_id"], ids["existing_job"])[3],
           db_app_row(ids["matcher_id"], ids["existing_job"])[3] == 0
           and existing_app_id is not None)

    print("\n--- 3. Test 2: auto ON -> a newly matched candidate is emailed ---")
    res = apply(B, ids["designer_id"], ids["design_job"])
    body = res.json() if res.status_code == 200 else {}
    record("Designer matched the design job", "matched", body.get("match_status"),
           body.get("match_status") == "matched")
    record("Automatic email went out", 1, sent_count_for(ids["designer_email"]),
           sent_count_for(ids["designer_email"]) == 1)
    drow = db_app_row(ids["designer_id"], ids["design_job"])
    design_app_id = drow[0]
    record("Automatic delivery persisted", (1, "automatic"), (drow[3], drow[4]),
           drow[3] == 1 and drow[4] == "automatic")

    st, rows = list_rows(HR)
    design_title = next(
        (k[1] for k in rows if k[0] == ids["designer_id"] and k[1].startswith("Brand Designer")),
        None,
    )
    drow_ui = rows.get((ids["designer_id"], design_title), {})
    record("Card shows sent", 1, drow_ui.get("code_email_sent"),
           drow_ui.get("code_email_sent") == 1)
    record("Card shows automatic", "automatic", drow_ui.get("code_send_method"),
           drow_ui.get("code_send_method") == "automatic")
    record("Card keeps the matched status", "matched", drow_ui.get("match_status"),
           drow_ui.get("match_status") == "matched")

    print("\n--- 4. Test 3: auto ON + unmatched never triggers a code ---")
    res = apply(B, ids["designer_id"], ids["platform_job"])
    body = res.json() if res.status_code == 200 else {}
    record("Designer is unmatched on the platform job", "unmatched", body.get("match_status"),
           body.get("match_status") == "unmatched")
    urow = db_app_row(ids["designer_id"], ids["platform_job"])
    record("Unmatched attempt got no code", (0, None), (urow[3], urow[4]),
           urow[3] == 0 and not urow[4])
    record("Unmatched attempt sent no email", 1, sent_count_for(ids["designer_email"]),
           sent_count_for(ids["designer_email"]) == 1)

    st, rows = list_rows(HR)
    urow_ui = {
        k: v for k, v in rows.items()
        if k[0] == ids["designer_id"] and k[1].startswith("Data Platform")
    }
    unmatched_rows = [r for r in rows.values() if r.get("match_status") == "unmatched"]
    record("HR list marks the attempt unmatched", 1, len(unmatched_rows),
           len(unmatched_rows) >= 1)
    record("Unmatched card is not marked sent", 0,
           next(iter(urow_ui.values()), {}).get("code_email_sent", 0),
           next(iter(urow_ui.values()), {}).get("code_email_sent", 0) == 0)

    print("\n--- 5. Test 5: refreshes / retries / re-sends never duplicate ---")
    sent_before = sent_count_for(ids["designer_email"])
    for _ in range(3):
        list_rows(HR)
    record("Repeated loads send nothing new", sent_before, sent_count_for(ids["designer_email"]),
           sent_count_for(ids["designer_email"]) == sent_before)
    again = manual_send(HR, design_app_id, "Creative")
    obody = again.json() if again.status_code == 200 else {}
    record("Re-send keeps the code", 1, obody.get("code_email_sent"),
           obody.get("code_email_sent") == 1)
    record("Re-send sends no second email", sent_before, sent_count_for(ids["designer_email"]),
           sent_count_for(ids["designer_email"]) == sent_before)
    record("Re-send never rewrites the method", "automatic", obody.get("code_send_method"),
           obody.get("code_send_method") == "automatic")
    dup = apply(B, ids["designer_id"], ids["design_job"])
    detail = (dup.json() or {}).get("detail") if dup.status_code else None
    record("Duplicate apply is still rejected", "Already applied to this job", detail,
           dup.status_code == 400 and detail == "Already applied to this job")

    print("\n--- 6. Test 4: switching OFF stops future sends only ---")
    res = set_setting(HR, False)
    sbody = res.json() if res.status_code == 200 else {}
    record("Switch can be turned OFF", False, sbody.get("auto_interview_codes"),
           sbody.get("auto_interview_codes") is False)
    st, enabled = get_setting(HR)
    record("Switch persisted as OFF", False, enabled, enabled is False)

    sent_before = sent_count_for(ids["matcher_email"])
    res = apply(A, ids["matcher_id"], ids["later_job"])
    body = res.json() if res.status_code == 200 else {}
    record("New match while OFF", "matched", body.get("match_status"),
           body.get("match_status") == "matched")
    lrow = db_app_row(ids["matcher_id"], ids["later_job"])
    record("OFF means no automatic code", (0, None), (lrow[3], lrow[4]),
           lrow[3] == 0 and not lrow[4])
    record("OFF sends no email", sent_before, sent_count_for(ids["matcher_email"]),
           sent_count_for(ids["matcher_email"]) == sent_before)
    drow = db_app_row(ids["designer_id"], ids["design_job"])
    record("Already sent codes are untouched", (1, "automatic"), (drow[3], drow[4]),
           drow[3] == 1 and drow[4] == "automatic")

    print("\n--- 7. Test 7: automatic delivery failure is reported honestly ---")
    set_setting(HR, True)
    FAIL["on"] = True
    res = apply(A, ids["matcher_id"], ids["fail_job"])
    body = res.json() if res.status_code == 200 else {}
    record("Apply still succeeds when email fails", 200, res.status_code, res.status_code == 200)
    record("Candidate stays matched", "matched", body.get("match_status"),
           body.get("match_status") == "matched")
    frow = db_app_row(ids["matcher_id"], ids["fail_job"])
    fail_app_id = frow[0]
    generated_code = frow[2]
    record("Failed delivery is not marked sent", (0, None), (frow[3], frow[4]),
           frow[3] == 0 and not frow[4])
    record("A code was generated but withheld", True, bool(generated_code), bool(generated_code))

    st, rows = list_rows(HR)
    fail_title = next(
        (k[1] for k in rows if k[0] == ids["matcher_id"] and k[1].startswith("Service Engineer")),
        None,
    )
    fail_ui = rows.get((ids["matcher_id"], fail_title), {})
    record("HR still sees the failed match", "matched", fail_ui.get("match_status"),
           fail_ui.get("match_status") == "matched")
    record("HR sees it as not sent", 0, fail_ui.get("code_email_sent"),
           fail_ui.get("code_email_sent") == 0)

    FAIL["on"] = False
    res = manual_send(HR, fail_app_id, "Engineering")
    mbody = res.json() if res.status_code == 200 else {}
    record("Manual retry after failure works", 1, mbody.get("code_email_sent"),
           mbody.get("code_email_sent") == 1)
    record("Manual retry records the method", "manual", mbody.get("code_send_method"),
           mbody.get("code_send_method") == "manual")
    record("Retry reuses the same code", generated_code, mbody.get("interview_code"),
           mbody.get("interview_code") == generated_code)

    print("\n--- 8. Test 8: the switch survives a new login session ---")
    st, hr2 = login("/hr/login", ids["hr_email"])
    record("Re-login", 200, st, st == 200)
    HR2 = {"Authorization": f"Bearer {hr2.get('auth_token', '')}"}
    st, enabled = get_setting(HR2)
    record("ON is still ON after re-login", True, enabled, enabled is True)
    set_setting(HR2, False)
    st, hr3 = login("/hr/login", ids["hr_email"])
    HR3 = {"Authorization": f"Bearer {hr3.get('auth_token', '')}"}
    st, enabled = get_setting(HR3)
    record("OFF is still OFF after re-login", False, enabled, enabled is False)

    print("\n--- 9. Security: another HR can neither read nor change it ---")
    res = client.get(HR_SETTING, headers=HRO)
    record("Other HR cannot read the switch", True, res.status_code,
           res.status_code in (403, 404))
    res = set_setting(HRO, True)
    record("Other HR cannot enable it", 403, res.status_code, res.status_code == 403)
    res = manual_send(HRO, platform_app_id, "Engineering")
    record("Other HR cannot send a code", 404, res.status_code, res.status_code == 404)
    st, enabled = get_setting(HR3)
    record("Switch was not changed by the other HR", False, enabled, enabled is False)

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
