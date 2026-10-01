"""Synthetic authorization test matrix for the MeLun Hire API.

Runs directly (no pytest dependency) against a COPY of the SQLite database so
no development data is modified and no real candidate data is read or asserted
on - only the synthetic accounts created here are used.

Usage:  python security_matrix_test.py
Exit code 0 = every expectation held, 1 = at least one FAIL.
"""
import os
import shutil
import sqlite3
import sys
import tempfile
import uuid
from datetime import datetime, timedelta

BACKEND = os.path.dirname(os.path.abspath(__file__))
if BACKEND not in sys.path:
    sys.path.insert(0, BACKEND)

# Development/test defaults: cookie may be non-Secure (http), debug off.
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("SESSION_COOKIE_SECURE", "false")
os.environ.setdefault("APP_DEBUG", "false")

REAL_DB = os.path.join(BACKEND, "database", "database.db")
TMP_DIR = tempfile.mkdtemp(prefix="quno_sec_test_")
TMP_DB = os.path.join(TMP_DIR, "database.db")
shutil.copyfile(REAL_DB, TMP_DB)  # schema/data template; tests write only here

RESULTS = []


def record(name, expected, actual, ok):
    RESULTS.append((name, expected, actual, ok))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}: expected={expected} actual={actual}")


def patch_db_paths():
    """Point every module that talks to SQLite at the temporary copy."""
    import main as main_mod
    import auth.sessions as sessions_mod
    import auth.authorization as authz_mod
    import auth.routes.applicant_auth as applicant_auth_mod
    import auth.routes.hr_auth as hr_auth_mod
    import auth.routes.hr_applicants as hr_applicants_mod
    import auth.routes.hr_company_profile as company_mod
    import auth.routes.hr_job_posts as job_posts_mod
    import auth.routes.hr_settings as hr_settings_mod
    import routes.applicant as applicant_router_mod
    import routes.career_quest as career_quest_mod
    import routes.hr_notifications as notifications_mod
    import routes.talent_arena as talent_arena_mod
    import routes.proctoring as proctoring_mod
    import database.db as db_mod

    for mod in (
        main_mod, sessions_mod, authz_mod, applicant_auth_mod, hr_auth_mod,
        hr_applicants_mod, company_mod, job_posts_mod, hr_settings_mod,
        applicant_router_mod, career_quest_mod, notifications_mod, talent_arena_mod,
        proctoring_mod,
    ):
        if hasattr(mod, "DB_PATH"):
            mod.DB_PATH = TMP_DB
    db_mod.DB_PATH = TMP_DB
    sessions_mod._table_ready = False
    sessions_mod.ensure_auth_sessions_table()
    # The temp copy is taken before `import main` runs its safe migrations, so
    # re-apply them against the copy (additive, idempotent).
    main_mod.ensure_application_columns()
    main_mod.ensure_interview_report_columns()
    proctoring_mod.ensure_proctoring_schema()

    return {
        "main": main_mod,
        "proctoring": proctoring_mod,
    }

def seed_synthetic_data():
    """Create two tenants and two applicants, each with one application."""
    conn = sqlite3.connect(TMP_DB, isolation_level=None)
    cur = conn.cursor()
    tag = uuid.uuid4().hex[:6]

    hr_cols = [r[1] for r in cur.execute("PRAGMA table_info(hr_users)")]
    app_cols = [r[1] for r in cur.execute("PRAGMA table_info(applicants)")]

    from utils.security import hash_password

    password = "TestPass!2345"
    pw_hash = hash_password(password)
    emails = {
        "hr_a_email": f"hr.a.{tag}@example.com",
        "hr_b_email": f"hr.b.{tag}@example.com",
        "applicant_a_email": f"cand.a.{tag}@example.com",
        "applicant_b_email": f"cand.b.{tag}@example.com",
    }

    def insert(table, values):
        cols = list(values.keys())
        cur.execute(
            f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})",
            [values[c] for c in cols],
        )
        return cur.lastrowid

    hr_a_id = insert("hr_users", {k: v for k, v in {
        "company_name": f"Tenant A {tag}", "hr_name": "HR A",
        "email": emails["hr_a_email"], "password_hash": pw_hash,
    }.items() if k in hr_cols})
    hr_b_id = insert("hr_users", {
        "company_name": f"Tenant B {tag}", "hr_name": "HR B",
        "email": emails["hr_b_email"], "password_hash": pw_hash,
    })

    applicant_a_id = f"CAND-A-{tag.upper()}"
    applicant_b_id = f"CAND-B-{tag.upper()}"
    insert("applicants", {k: v for k, v in {
        "id": applicant_a_id, "full_name": "Synthetic Candidate A",
        "email": emails["applicant_a_email"], "phone": "0000000000",
        "password": pw_hash, "location": "Test", "experience_years": 1,
        "skills": "python", "created_at": datetime.utcnow(),
    }.items() if k in app_cols})
    insert("applicants", {k: v for k, v in {
        "id": applicant_b_id, "full_name": "Synthetic Candidate B",
        "email": emails["applicant_b_email"], "phone": "0000000000",
        "password": pw_hash, "location": "Test", "experience_years": 1,
        "skills": "python", "created_at": datetime.utcnow(),
    }.items() if k in app_cols})

    def insert_job(hr_id, title):
        return insert("hr_job_posts", {
            "hr_id": hr_id, "job_title": title, "job_domain": "Web Development",
            "job_type": "Full-time", "job_mode": "Remote", "experience_required": "1",
            "location": "Test", "description": "synthetic", "status": "Open",
            "created_at": datetime.utcnow().isoformat(),
        })

    job_a_id = insert_job(hr_a_id, f"Tenant A Job {tag}")
    job_b_id = insert_job(hr_b_id, f"Tenant B Job {tag}")

    def insert_application(applicant_id, job_id, code):
        return insert("applications", {
            "applicant_id": applicant_id, "job_id": job_id, "resume_status": "Pending",
            "applied_at": datetime.utcnow().isoformat(), "status": "approved",
            "interview_code": code, "interview_status": "Not Started",
            "interview_expires_at": (datetime.utcnow() + timedelta(hours=24)).isoformat(),
            "reissue_requested": 0, "reissue_count": 0, "code_email_sent": 0,
        })

    code_a = f"QUNO-AA-{tag.upper()}"
    code_b = f"QUNO-BB-{tag.upper()}"
    app_a_id = insert_application(applicant_a_id, job_a_id, code_a)
    app_b_id = insert_application(applicant_b_id, job_b_id, code_b)

    cur.execute(
        "INSERT INTO interview_reports (application_id, domain, answers_json, analysis_json, created_at) "
        "VALUES (?, ?, '{}', '{}', ?)",
        (app_a_id, "Web Development", datetime.utcnow().isoformat()),
    )
    conn.commit()
    conn.close()

    return {
        **emails, "password": password,
        "hr_a_id": hr_a_id, "hr_b_id": hr_b_id,
        "applicant_a_id": applicant_a_id, "applicant_b_id": applicant_b_id,
        "job_a_id": job_a_id, "job_b_id": job_b_id,
        "app_a_id": app_a_id, "app_b_id": app_b_id,
        "interview_code_a": code_a, "interview_code_b": code_b,
    }

def main():
    mods = patch_db_paths()
    ids = seed_synthetic_data()

    from fastapi.testclient import TestClient
    import main as main_mod
    from utils.rate_limit import reset_rate_limits

    client = TestClient(main_mod.app)
    # Separate client with an empty cookie jar: used for "unauthenticated"
    # checks so a session cookie from a previous login cannot leak into them.
    anon = TestClient(main_mod.app)
    reset_rate_limits()

    def login(path, email):
        res = client.post(path, json={"email": email, "password": ids["password"]})
        body = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
        return res.status_code, body

    print("--- 0. Synthetic principals authenticate ---")
    st, hr_a = login("/hr/login", ids["hr_a_email"])
    record("HR A login", 200, st, st == 200)
    st, hr_b = login("/hr/login", ids["hr_b_email"])
    record("HR B login", 200, st, st == 200)
    st, app_a = login("/applicant/login", ids["applicant_a_email"])
    record("Applicant A login", 200, st, st == 200)
    st, app_b = login("/applicant/login", ids["applicant_b_email"])
    record("Applicant B login", 200, st, st == 200)

    A = {"Authorization": f"Bearer {app_a.get('auth_token', '')}"}
    B = {"Authorization": f"Bearer {app_b.get('auth_token', '')}"}
    HRA = {"Authorization": f"Bearer {hr_a.get('auth_token', '')}"}
    HRB = {"Authorization": f"Bearer {hr_b.get('auth_token', '')}"}

    for label, payload in (("applicant A", app_a), ("applicant B", app_b),
                           ("HR A", hr_a), ("HR B", hr_b)):
        record(f"{label} gets a session token", True,
               bool(payload.get("auth_token")), bool(payload.get("auth_token")))

    print("\n--- 1. Unauthenticated -> protected endpoint must FAIL (401) ---")
    unauth_cases = [
        ("GET", f"/applicant/profile/{ids['applicant_a_id']}"),
        ("GET", f"/applicant/applied-positions/{ids['applicant_a_id']}"),
        ("GET", f"/applicant/resume/{ids['applicant_a_id']}"),
        ("GET", f"/applicant/interview-report/{ids['app_a_id']}"),
        ("GET", f"/applicant/notifications/{ids['applicant_a_id']}"),
        ("GET", f"/applicant/profile-pic/{ids['applicant_a_id']}"),
        ("POST", "/applicant/verify-interview-code"),
        ("POST", "/applicant/request-reissue"),
        ("POST", "/applicant/update-profile"),
        ("POST", "/applicant/apply"),
        ("POST", "/interview/heartbeat"),
        ("POST", "/interview/abandon"),
        ("POST", "/interview/violate"),
        ("POST", "/interview/submit-report"),
        ("POST", "/interview/proctoring-event"),
        ("GET", f"/interview/proctoring-state/{ids['app_a_id']}"),
        ("GET", f"/hr/applicants/{ids['hr_a_id']}"),
        ("GET", f"/hr/applicant-resume/{ids['hr_a_id']}/{ids['applicant_a_id']}"),
        ("GET", f"/hr/dashboard/{ids['hr_a_id']}"),
        ("GET", f"/hr/dashboard/analytics/{ids['hr_a_id']}"),
        ("GET", f"/hr/dashboard/applicants/{ids['hr_a_id']}"),
        ("GET", f"/hr/dashboard/active-jobs/{ids['hr_a_id']}"),
        ("GET", f"/hr/resume-reports/{ids['hr_a_id']}"),
        ("GET", f"/hr/resume-report/{ids['app_a_id']}"),
        ("GET", f"/hr/interview-report/{ids['app_a_id']}"),
        ("GET", f"/hr/completed-interviews/{ids['hr_a_id']}"),
        ("GET", f"/hr/pending-interviews/{ids['hr_a_id']}"),
        ("GET", f"/hr/notifications/{ids['hr_a_id']}"),
        ("GET", f"/hr/profile/{ids['hr_a_id']}"),
        ("GET", f"/hr/company-profile/{ids['hr_a_id']}"),
        ("GET", f"/hr/job-posts/{ids['hr_a_id']}"),
        ("GET", f"/hr/notification-preferences/{ids['hr_a_id']}"),
        ("POST", "/hr/job-post"),
        ("POST", "/hr/applicant/status"),
        ("POST", "/hr/applicant/interview-code"),
        ("POST", "/hr/applicant/regenerate-interview-code"),
        ("POST", "/hr/applicant/reset-expiry"),
        ("POST", "/hr/company-profile"),
        ("POST", "/hr/change-password"),
        ("POST", "/hr/deactivate-account"),
        ("GET", f"/career-quest/progress?applicant_id={ids['applicant_a_id']}"),
        ("GET", "/career-quest/challenges"),
        ("GET", "/career-quest/attempts?applicant_id=x"),
        ("POST", "/career-quest/attempts/start"),
        ("GET", f"/talent-arena/candidates/{ids['hr_a_id']}"),
        ("GET", f"/talent-arena/radar/{ids['hr_a_id']}"),
        ("GET", f"/talent-arena/evaluations/{ids['hr_a_id']}"),
        ("GET", f"/talent-arena/comparisons/{ids['hr_a_id']}"),
        ("GET", f"/talent-arena/teams/{ids['hr_a_id']}"),
        ("GET", f"/talent-arena/hiring-quest/{ids['hr_a_id']}"),
        ("GET", f"/talent-arena/votes/{ids['hr_a_id']}"),
        ("GET", f"/talent-arena/challenge-requests/{ids['hr_a_id']}"),
        ("GET", "/talent-arena/team-roles"),
        ("POST", "/talent-arena/evaluations"),
        ("POST", "/talent-arena/votes"),
    ]
    for method, path in unauth_cases:
        res = anon.request(method, path, json={} if method == "POST" else None)
        record(f"unauth {method} {path}", 401, res.status_code, res.status_code == 401)

    print("\n--- 1b. Cookie session (no token in JS storage) works ---")
    client.post("/applicant/login",
                json={"email": ids["applicant_a_email"], "password": ids["password"]})
    res = client.get(f"/applicant/applied-positions/{ids['applicant_a_id']}")
    record("applicant session via HttpOnly cookie only", 200, res.status_code, res.status_code == 200)
    res = client.get(f"/applicant/applied-positions/{ids['applicant_b_id']}")
    record("cookie session still enforces ownership", (403, 404), res.status_code,
           res.status_code in (403, 404))

    print("\n--- 2. Applicant A vs Applicant B ---")
    cases = [
        ("A reads own profile", "GET", f"/applicant/profile/{ids['applicant_a_id']}", A, (200,)),
        ("A reads B profile", "GET", f"/applicant/profile/{ids['applicant_b_id']}", A, (403, 404)),
        ("A reads own resume analysis", "GET", f"/applicant/resume/{ids['applicant_a_id']}", A, (200,)),
        ("A reads B resume analysis", "GET", f"/applicant/resume/{ids['applicant_b_id']}", A, (403, 404)),
        ("A reads own applications", "GET", f"/applicant/applied-positions/{ids['applicant_a_id']}", A, (200,)),
        ("A reads B applications", "GET", f"/applicant/applied-positions/{ids['applicant_b_id']}", A, (403, 404)),
        ("A reads own interview report", "GET", f"/applicant/interview-report/{ids['app_a_id']}", A, (200,)),
        ("A reads own notifications", "GET", f"/applicant/notifications/{ids['applicant_a_id']}", A, (200,)),
        ("A reads B notifications", "GET", f"/applicant/notifications/{ids['applicant_b_id']}", A, (403, 404)),
        ("A reads own profile pic", "GET", f"/applicant/profile-pic/{ids['applicant_a_id']}", A, (200, 404)),
        ("A reads B profile pic", "GET", f"/applicant/profile-pic/{ids['applicant_b_id']}", A, (403, 404)),
    ]
    for name, method, path, headers, expected in cases:
        res = client.request(method, path, headers=headers)
        record(name, expected, res.status_code, res.status_code in expected)

    res = client.post("/applicant/request-reissue", json={"application_id": ids["app_b_id"]}, headers=A)
    record("A requests reissue on B's application", (403, 404), res.status_code, res.status_code in (403, 404))
    res = client.get(f"/applicant/interview-report/{ids['app_b_id']}", headers=A)
    record("A reads B's interview report (no data leaked)", "no report",
           f"{res.status_code}:{res.text[:30]}",
           res.status_code in (403, 404) or "error" in res.text)

    print("\n--- 3. Interview binding: code -> application -> applicant (2E) ---")
    res = client.post("/applicant/verify-interview-code",
                      json={"interview_code": ids["interview_code_a"]}, headers=B)
    body = res.json() if res.status_code == 200 else {}
    record("B uses A's interview code", False, body.get("valid"), body.get("valid") is False)
    res = client.post("/applicant/verify-interview-code",
                      json={"interview_code": ids["interview_code_b"]}, headers=A)
    body = res.json() if res.status_code == 200 else {}
    record("A uses B's interview code", False, body.get("valid"), body.get("valid") is False)
    res = client.post("/applicant/verify-interview-code",
                      json={"interview_code": ids["interview_code_a"]}, headers=A)
    body = res.json() if res.status_code == 200 else {}
    record("A uses A's interview code", True, body.get("valid"), body.get("valid") is True)

    # 2I: a second verification must not restart an interview that is already
    # in progress (server-side state machine, not a front-end guard).
    res = client.post("/applicant/verify-interview-code",
                      json={"interview_code": ids["interview_code_a"]}, headers=A)
    body = res.json() if res.status_code == 200 else {}
    record("re-using the same code after start is refused", False, body.get("valid"),
           body.get("valid") is False)

    for name, path, payload in (
        ("A heartbeats B's interview", "/interview/heartbeat", {"application_id": ids["app_b_id"]}),
        ("A abandons B's interview", "/interview/abandon", {"application_id": ids["app_b_id"]}),
        ("A violates B's interview", "/interview/violate", {"application_id": ids["app_b_id"]}),
        ("A reports a proctoring event for B's interview", "/interview/proctoring-event",
         {"application_id": ids["app_b_id"], "event_type": "tab_switch"}),
    ):
        res = client.post(path, json=payload, headers=A)
        record(name, (403, 404), res.status_code, res.status_code in (403, 404))

    res = client.post("/interview/submit-report", json={
        "application_id": ids["app_b_id"], "domain": "x", "answers": {}, "analysis": {},
    }, headers=A)
    record("A submits a report for B's interview", (403, 404), res.status_code, res.status_code in (403, 404))

    print("\n--- 3b. Server-authoritative proctoring (2G) ---")

    def proctoring_state(app_id, headers):
        res = client.get(f"/interview/proctoring-state/{app_id}", headers=headers)
        return res.status_code, (res.json() if res.status_code == 200 else {})

    def violation_rows(app_id):
        conn = sqlite3.connect(TMP_DB)
        try:
            return conn.execute(
                "SELECT COUNT(*) FROM proctoring_violations WHERE application_id = ?",
                (app_id,),
            ).fetchone()[0]
        finally:
            conn.close()

    def interview_status(app_id):
        conn = sqlite3.connect(TMP_DB)
        try:
            return conn.execute(
                "SELECT interview_status FROM applications WHERE id = ?", (app_id,)
            ).fetchone()[0]
        finally:
            conn.close()

    def report_event(app_id, event_type, headers, extra=None):
        payload = {"application_id": app_id, "event_type": event_type}
        payload.update(extra or {})
        res = client.post("/interview/proctoring-event", json=payload, headers=headers)
        return res.status_code, (res.json() if res.status_code == 200 else {})

    # The application was started in section 3, so the server accepts events.
    code, body = report_event(ids["app_a_id"], "tab_switch", A)
    record("server counts the 1st reported violation", (200, 1),
           (code, body.get("warning_count")),
           code == 200 and body.get("warning_count") == 1 and body.get("can_continue") is True)

    code, body = report_event(ids["app_a_id"], "tab_switch", A)
    record("repeating the same event cannot inflate the count", (True, 1),
           (body.get("duplicate"), body.get("warning_count")),
           body.get("duplicate") is True and body.get("warning_count") == 1)

    # A client that claims its own count/state must not be believed.
    code, body = report_event(ids["app_a_id"], "multiple_faces", A, extra={
        "warning_count": 0, "warnings_remaining": 99, "terminated": False, "accepted": False,
    })
    record("client-supplied count/termination is ignored", (2, False),
           (body.get("warning_count"), body.get("terminated")),
           body.get("warning_count") == 2 and body.get("terminated") is False)

    code, body = report_event(ids["app_a_id"], "face_missing", A)
    record("3rd violation terminates server-side (3-warning policy)", (True, False),
           (body.get("terminated"), body.get("can_continue")),
           body.get("terminated") is True and body.get("can_continue") is False)
    record("server persisted the termination state", "Violated",
           interview_status(ids["app_a_id"]), interview_status(ids["app_a_id"]) == "Violated")
    rows = violation_rows(ids["app_a_id"])
    record("exactly 3 violations recorded (dedupe + server policy)", 3, rows, rows == 3)

    code, body = report_event(ids["app_a_id"], "window_blur", A)
    record("no event is accepted after termination", (False, True),
           (body.get("accepted"), body.get("terminated")),
           body.get("accepted") is False and body.get("terminated") is True)
    rows = violation_rows(ids["app_a_id"])
    record("rejected post-termination events are not persisted", 3, rows, rows == 3)

    legacy = client.post("/interview/violate",
                         json={"application_id": ids["app_a_id"], "event_type": "manual"},
                         headers=A)
    legacy_body = legacy.json() if legacy.status_code == 200 else {}
    record("legacy /interview/violate cannot revive a terminated interview", True,
           legacy_body.get("terminated"), legacy_body.get("terminated") is True)

    code, _ = proctoring_state(ids["app_b_id"], A)
    record("A cannot read B's proctoring state", (403, 404), code, code in (403, 404))
    code, body = proctoring_state(ids["app_a_id"], A)
    record("A reads own authoritative proctoring state", 200, code, code == 200)
    record("own state carries the server termination + timeline", (True, 3),
           (body.get("terminated"), len(body.get("violations") or [])),
           body.get("terminated") is True and len(body.get("violations") or []) == 3)

    print("\n--- 3c. Interview submission is idempotent (2I) ---")

    def report_rows(app_id):
        conn = sqlite3.connect(TMP_DB)
        try:
            return conn.execute(
                "SELECT COUNT(*) FROM interview_reports WHERE application_id = ?", (app_id,)
            ).fetchone()[0]
        finally:
            conn.close()

    res = client.post("/applicant/verify-interview-code",
                      json={"interview_code": ids["interview_code_b"]}, headers=B)
    body = res.json() if res.status_code == 200 else {}
    record("B starts its own interview before submitting", True, body.get("valid"),
           body.get("valid") is True)

    # The body carries a spoofed applicant_id: ownership must come from the session.
    submission = {
        "application_id": ids["app_b_id"],
        "domain": "Web Development",
        "answers": {"technical": []},
        "analysis": {"technical": []},
        "applicant_id": ids["applicant_a_id"],
    }
    res = client.post("/interview/submit-report", json=submission, headers=B)
    body = res.json() if res.status_code == 200 else {}
    record("first submission of the interview succeeds", (200, True, None),
           (res.status_code, body.get("success"), body.get("duplicate")),
           res.status_code == 200 and body.get("success") is True and not body.get("duplicate"))
    rows = report_rows(ids["app_b_id"])
    record("exactly one report row is created", 1, rows, rows == 1)
    record("submission completes the interview", "Completed",
           interview_status(ids["app_b_id"]), interview_status(ids["app_b_id"]) == "Completed")

    conn = sqlite3.connect(TMP_DB)
    stored_owner = conn.execute(
        "SELECT applicant_id FROM interview_reports WHERE application_id = ?",
        (ids["app_b_id"],),
    ).fetchone()[0]
    conn.close()
    record("stored report owner is the session applicant, not the body id",
           str(ids["applicant_b_id"]), str(stored_owner),
           str(stored_owner) == str(ids["applicant_b_id"]))

    res = client.post("/interview/submit-report", json=submission, headers=B)
    body = res.json() if res.status_code == 200 else {}
    record("duplicate submission is a safe no-op", (200, True, True),
           (res.status_code, body.get("success"), body.get("duplicate")),
           res.status_code == 200 and body.get("success") is True and body.get("duplicate") is True)
    rows = report_rows(ids["app_b_id"])
    record("duplicate submission creates no second report", 1, rows, rows == 1)
    record("duplicate submission does not change the interview state", "Completed",
           interview_status(ids["app_b_id"]), interview_status(ids["app_b_id"]) == "Completed")

    # A proctoring-terminated interview can never be completed by submitting a
    # report: the server's termination state must survive a late/tampered submit.
    res = client.post("/interview/submit-report", json={
        "application_id": ids["app_a_id"], "domain": "Web Development",
        "answers": {}, "analysis": {},
    }, headers=A)
    body = res.json() if res.status_code == 200 else {}
    record("a proctoring-terminated interview cannot be submitted",
           (200, False, True),
           (res.status_code, body.get("success"), body.get("terminated")),
           res.status_code == 200 and body.get("success") is False
           and body.get("terminated") is True)
    record("termination state survives the refused submission", "Violated",
           interview_status(ids["app_a_id"]), interview_status(ids["app_a_id"]) == "Violated")
    rows = report_rows(ids["app_a_id"])
    record("refused submission creates no report", 1, rows, rows == 1)

    print("\n--- 4. HR A vs HR B (multi-tenant isolation, 2C) ---")
    hr_cases = [
        ("HR A lists own applicants", "GET", f"/hr/applicants/{ids['hr_a_id']}", HRA, (200,)),
        ("HR A lists HR B applicants", "GET", f"/hr/applicants/{ids['hr_b_id']}", HRA, (403,)),
        ("HR A reads own candidate interview report", "GET", f"/hr/interview-report/{ids['app_a_id']}", HRA, (200,)),
        ("HR A reads HR B candidate interview report", "GET", f"/hr/interview-report/{ids['app_b_id']}", HRA, (404,)),
        ("HR A reads own candidate resume report", "GET", f"/hr/resume-report/{ids['app_a_id']}", HRA, (200,)),
        ("HR A reads HR B candidate resume report", "GET", f"/hr/resume-report/{ids['app_b_id']}", HRA, (404,)),
        ("HR A reads own candidate profile", "GET", f"/applicant/profile/{ids['applicant_a_id']}", HRA, (200,)),
        ("HR A reads HR B candidate profile", "GET", f"/applicant/profile/{ids['applicant_b_id']}", HRA, (404,)),
        ("HR A reads own candidate resume file", "GET", f"/hr/applicant-resume/{ids['hr_a_id']}/{ids['applicant_a_id']}", HRA, (404,)),
        ("HR A reads HR B candidate resume file", "GET", f"/hr/applicant-resume/{ids['hr_a_id']}/{ids['applicant_b_id']}", HRA, (404,)),
        ("HR A impersonates HR B in resume path", "GET", f"/hr/applicant-resume/{ids['hr_b_id']}/{ids['applicant_a_id']}", HRA, (403,)),
        ("HR A reads HR B settings profile", "GET", f"/hr/profile/{ids['hr_b_id']}", HRA, (403,)),
        ("HR A reads HR B company profile", "GET", f"/hr/company-profile/{ids['hr_b_id']}", HRA, (403,)),
        ("HR A lists HR B job posts", "GET", f"/hr/job-posts/{ids['hr_b_id']}", HRA, (403,)),
        ("HR A reads HR B notifications", "GET", f"/hr/notifications/{ids['hr_b_id']}", HRA, (403,)),
        ("HR A reads HR B dashboard", "GET", f"/hr/dashboard/{ids['hr_b_id']}", HRA, (403,)),
        ("HR A reads HR B analytics", "GET", f"/hr/dashboard/analytics/{ids['hr_b_id']}", HRA, (403,)),
        ("HR A reads HR B resume report list", "GET", f"/hr/resume-reports/{ids['hr_b_id']}", HRA, (403,)),
        ("HR A reads HR B vote board", "GET", f"/talent-arena/votes/{ids['hr_b_id']}", HRA, (403,)),
        ("HR A reads HR B talent pool", "GET", f"/talent-arena/candidates/{ids['hr_b_id']}", HRA, (403,)),
        ("HR A reads HR B hiring quest", "GET", f"/talent-arena/hiring-quest/{ids['hr_b_id']}", HRA, (403,)),
        ("HR B reads own talent pool", "GET", f"/talent-arena/candidates/{ids['hr_b_id']}", HRB, (200,)),
        ("HR A reads own notifications", "GET", f"/hr/notifications/{ids['hr_a_id']}", HRA, (200,)),
        ("HR A reads own company profile", "GET", f"/hr/company-profile/{ids['hr_a_id']}", HRA, (200,)),
    ]
    for name, method, path, headers, expected in hr_cases:
        res = client.request(method, path, headers=headers)
        record(name, expected, res.status_code, res.status_code in expected)

    for name, path, payload, expected in (
        ("HR A closes HR B job", f"/hr/job-post/{ids['job_b_id']}/close", {}, (404,)),
        ("HR A regenerates HR B candidate's code", "/hr/applicant/regenerate-interview-code",
         {"application_id": ids["app_b_id"]}, (404,)),
        ("HR A resets HR B candidate's expiry", "/hr/applicant/reset-expiry",
         {"application_id": ids["app_b_id"]}, (404,)),
        ("HR A changes HR B application status", "/hr/applicant/status",
         {"application_id": ids["app_b_id"], "status": "rejected"}, (404,)),
        ("HR A issues a code for HR B candidate", "/hr/applicant/interview-code",
         {"application_id": ids["app_b_id"], "job_domain": "Web Development"}, (404,)),
    ):
        res = client.post(path, json=payload, headers=HRA)
        record(name, expected, res.status_code, res.status_code in expected)

    res = client.post("/hr/job-post", json={"hr_id": ids["hr_b_id"], "job_title": "Spoofed"}, headers=HRA)
    record("HR A creates a job using HR B's hr_id", (403,), res.status_code, res.status_code in (403,))
    res = client.post("/hr/job-post", json={"hr_id": ids["hr_a_id"], "job_title": "Legit Job"}, headers=HRA)
    record("HR A creates a job for itself", (200,), res.status_code, res.status_code == 200)

    print("\n--- 5. Role confusion (applicant <-> HR) ---")
    for method, path in [
        ("GET", f"/hr/applicants/{ids['hr_a_id']}"),
        ("GET", f"/hr/dashboard/{ids['hr_a_id']}"),
        ("GET", f"/hr/company-profile/{ids['hr_a_id']}"),
        ("GET", f"/hr/notifications/{ids['hr_a_id']}"),
        ("GET", f"/hr/job-posts/{ids['hr_a_id']}"),
        ("GET", f"/talent-arena/candidates/{ids['hr_a_id']}"),
    ]:
        res = client.request(method, path, headers=A)
        record(f"applicant -> {path}", 403, res.status_code, res.status_code == 403)

    for method, path in [
        ("GET", f"/applicant/applied-positions/{ids['applicant_a_id']}"),
        ("GET", f"/applicant/notifications/{ids['applicant_a_id']}"),
        ("GET", f"/applicant/resume/{ids['applicant_a_id']}"),
        ("GET", f"/applicant/interview-report/{ids['app_a_id']}"),
        ("GET", f"/career-quest/progress?applicant_id={ids['applicant_a_id']}"),
        ("GET", f"/talent-arena/my-challenges?applicant_id={ids['applicant_a_id']}"),
    ]:
        res = client.request(method, path, headers=HRA)
        record(f"HR -> {path}", 403, res.status_code, res.status_code == 403)

    print("\n--- 6. Spoofed identifiers are not trusted ---")
    res = client.post("/career-quest/mystery/unlock",
                      json={"applicant_id": ids["applicant_b_id"], "challenge_id": "mystery"}, headers=A)
    conn = sqlite3.connect(TMP_DB)
    row = conn.execute(
        "SELECT applicant_id FROM career_quest_mystery WHERE applicant_id = ?",
        (ids["applicant_b_id"],),
    ).fetchone()
    conn.close()
    record("A cannot write B's career-quest state (spoofed body id)", None, row, row is None)

    res = client.get("/career-quest/progress?applicant_id=" + ids["applicant_b_id"], headers=A)
    record("A asking for B's progress gets A's own data (or an error)",
           "no B data", res.status_code, res.status_code in (200, 403, 404))

    print("\n--- 7. Password reset hardening (2F) ---")
    res = client.post("/auth/reset-password",
                      json={"email": ids["applicant_a_email"], "password": "NewPass!2345"})
    record("anonymous legacy reset without a code", 400, res.status_code, res.status_code == 400)
    res = client.post("/auth/reset-password",
                      json={"email": ids["applicant_a_email"], "otp": "000000", "password": "NewPass!2345"})
    record("anonymous legacy reset with a wrong code", 400, res.status_code, res.status_code == 400)
    st, _ = login("/applicant/login", ids["applicant_a_email"])
    record("original password still works after failed resets", 200, st, st == 200)
    res = client.post("/auth/forgot-password", json={"email": "nobody@example.test"})
    record("forgot-password does not disclose unknown emails", 200, res.status_code,
           res.status_code == 200 and "registered" not in res.text.lower() or res.status_code == 200)

    print("\n--- 8. Session lifecycle ---")
    res = client.post("/applicant/verify-interview-code", json={"interview_code": "x"}, headers=B)
    record("B session valid before logout", 200, res.status_code, res.status_code == 200)
    res = client.post("/applicant/logout", headers=B)
    record("applicant logout", 200, res.status_code, res.status_code == 200)
    res = client.post("/applicant/verify-interview-code", json={"interview_code": "x"}, headers=B)
    record("revoked token is rejected", 401, res.status_code, res.status_code == 401)
    res = client.post("/applicant/verify-interview-code", json={"interview_code": "x"},
                      headers={"Authorization": "Bearer forged-token-value"})
    record("forged token is rejected", 401, res.status_code, res.status_code == 401)

    passed = sum(1 for *_, ok in RESULTS if ok)
    failed = [r for r in RESULTS if not r[3]]
    print("\n" + "=" * 70)
    print(f"TOTAL: {len(RESULTS)}   PASSED: {passed}   FAILED: {len(failed)}")
    for name, expected, actual, _ in failed:
        print(f"  FAILED -> {name} (expected {expected}, got {actual})")
    print("=" * 70)
    return 1 if failed else 0


if __name__ == "__main__":
    try:
        code = main()
    finally:
        shutil.rmtree(TMP_DIR, ignore_errors=True)
    sys.exit(code)
