from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Depends, Request
import hashlib
import sqlite3
import os
import re
import json
import random
import logging
from datetime import datetime, timedelta
from pydantic import BaseModel
from typing import List, Dict, Optional
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from utils.security import hash_password
from auth.sessions import (
    current_applicant_id,
    current_hr_id,
    get_current_applicant,
    get_current_hr,
    get_current_user,
    require_applicant_ownership,
    require_hr_ownership,
    revoke_all_sessions_for,
)
from auth.authorization import (
    require_applicant_owns_application,
    require_hr_owns_applicant,
    require_hr_owns_application,
)
from utils.rate_limit import (
    limit_interview_submit,
    limit_password_reset,
    limit_verify_code,
)
import smtplib
from email.mime.text import MIMEText


# ---- Generic 500 helper: internal exception text is never sent to clients ----
def _public_error(detail: str = "Request failed. Please try again.") -> HTTPException:
    return HTTPException(status_code=500, detail=detail)


# ---- Password-reset codes: stored hashed, time limited, single use ----
RESET_CODE_TTL_MINUTES = 15
_RESET_TABLE_SQL = """
    CREATE TABLE IF NOT EXISTS password_reset (
        email TEXT,
        otp TEXT,
        role TEXT,
        created_at TEXT
    )
"""
_PASSWORD_POLICY = re.compile(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$")


def _hash_reset_code(code: str) -> str:
    return hashlib.sha256(str(code).encode("utf-8")).hexdigest()


def _password_policy_ok(password: str) -> bool:
    return bool(password) and bool(_PASSWORD_POLICY.match(password))


def _valid_reset_code(cur, email: str, code: str) -> bool:
    """True when `code` matches the newest unexpired reset code for `email`."""
    if not email or not code:
        return False
    cur.execute("""
        SELECT otp, created_at FROM password_reset
        WHERE email = ?
        ORDER BY created_at DESC
        LIMIT 1
    """, (email,))
    row = cur.fetchone()
    if not row or not row[0]:
        return False
    if str(row[0]) != _hash_reset_code(code):
        return False
    try:
        created = datetime.fromisoformat(str(row[1]))
    except (TypeError, ValueError):
        return False
    return datetime.utcnow() - created <= timedelta(minutes=RESET_CODE_TTL_MINUTES)


logger = logging.getLogger(__name__)

# Load environment configuration (.env) early so SMTP + CORS use real values.
try:
    from config.settings import DOTENV_PATH
    from dotenv import load_dotenv
    load_dotenv(DOTENV_PATH, override=True)
except Exception:
    pass

# =================================================
# EMAIL SENDER CONFIGURATION
# =================================================
# Sender identity/password come ONLY from the environment/.env — there is no
# hardcoded fallback. Missing values are surfaced by send_interview_email().
SENDER_EMAIL = os.environ.get("SENDER_EMAIL") or os.environ.get("SMTP_USERNAME") or ""
SENDER_APP_PASSWORD = os.environ.get("SENDER_PASSWORD") or os.environ.get("SMTP_PASSWORD") or ""

#=================================================
# EMAIL FUNCTION
#================================================
def send_interview_email(to_email, code, job_domain):

    subject = "Your Interview Access Code - MeLun Hire"

    body = f"""
Hi,

You have been shortlisted for: {job_domain}

Your Interview Access Code is:

👉 {code}

Please use this code to start your AI interview.

Regards,
MeLun Hire Team
"""

    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = SENDER_EMAIL
    msg["To"] = to_email

    smtp_server = os.environ.get("SMTP_SERVER", "smtp.gmail.com")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USERNAME") or SENDER_EMAIL
    smtp_password = SENDER_APP_PASSWORD

    if not SENDER_EMAIL:
        raise RuntimeError(
            "Sender email is not configured. Set SENDER_EMAIL (or SMTP_USERNAME) "
            "in Backend/3.Chat bot/.env to enable interview code emails."
        )

    if not smtp_password:
        raise RuntimeError(
            "SMTP password is not configured. Set SMTP_PASSWORD (or SENDER_PASSWORD) "
            "in Backend/3.Chat bot/.env to enable interview code emails."
        )

    server = smtplib.SMTP(smtp_server, smtp_port)
    server.starttls()
    server.login(smtp_user, smtp_password)
    server.send_message(msg)
    server.quit()

#=================================================
# APP INIT
#================================================
app = FastAPI(
    title="MeLun Hire – AI Hiring Platform",
    version="1.0.0",
    debug=os.environ.get("APP_DEBUG", "false").lower() == "true",
)

# Restrict CORS to known frontend origins (configurable via ALLOWED_ORIGINS).
# The auth flow uses credentials (cookies/token), so "*" is NEVER allowed:
# browsers reject Access-Control-Allow-Origin: * combined with credentials.
# Filter "*" out defensively so it can never pair with allow_credentials=True.
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get("ALLOWED_ORIGINS", "").split(",")
    if o.strip() and o.strip() != "*"
]
if not ALLOWED_ORIGINS:
    ALLOWED_ORIGINS = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ]
_frontend_url = (os.environ.get("FRONTEND_URL") or "").strip()
if _frontend_url and _frontend_url not in ALLOWED_ORIGINS:
    ALLOWED_ORIGINS.append(_frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# =================================================
# HEALTH CHECK
# =================================================
# Lightweight liveness probe — no database access, no auth — so the platform
# (Render health checks, uptime monitors, load balancers) can verify the API is
# up without touching sensitive data.
@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "ok"}


# =================================================
# REGISTER ROUTERS
# =================================================
from auth.routes.hr_auth import router as hr_auth_router
from auth.routes.hr_company_profile import router as hr_company_profile_router
from auth.routes.applicant_auth import router as applicant_auth_router
from auth.routes.applicant_settings import router as applicant_settings_router
from auth.routes.hr_settings import router as hr_settings_router
from auth.routes import hr_job_posts
from auth.routes import hr_applicants_router
from routes.hr_notifications import router as hr_notifications_router, applicant_notifications_router, create_notification
from routes.password_reset import router as password_reset_router
from routes.applicant import router as applicant_router
from routes.career_quest import router as career_quest_router
from routes.talent_arena import router as talent_arena_router
from routes.proctoring import (
    router as proctoring_router,
    ensure_proctoring_schema,
    record_event as record_proctoring_event,
)
from services.interview_scoring import score_from_analysis, final_score_from_analysis_json
from services.final_decision import (
    ensure_decision_columns,
    maybe_auto_decide,
    record_decision,
    VALID_DECISIONS,
    SOURCE_MANUAL,
)

app.include_router(hr_auth_router)
app.include_router(password_reset_router)
app.include_router(hr_company_profile_router)
app.include_router(applicant_auth_router)
app.include_router(applicant_settings_router)
app.include_router(hr_settings_router)
app.include_router(hr_job_posts.router)
app.include_router(hr_applicants_router)
app.include_router(hr_notifications_router)
app.include_router(applicant_notifications_router)
app.include_router(applicant_router)
app.include_router(career_quest_router)
app.include_router(talent_arena_router)
app.include_router(proctoring_router)

#=================================================
# HEARTBEAT ENDPOINT
#================================================
@app.post("/interview/heartbeat")
def heartbeat(data: dict, sess: dict = Depends(get_current_applicant)):
    application_id = data.get("application_id")
    session_applicant_id = str(sess.get("applicant_id") or "")
    if not session_applicant_id:
        raise HTTPException(status_code=403, detail="Authentication required.")

    conn = sqlite3.connect(DB_PATH, isolation_level=None)
    cur = conn.cursor()

    # Verify the application belongs to this applicant
    cur.execute("SELECT applicant_id FROM applications WHERE id = ?", (application_id,))
    row = cur.fetchone()
    if not row or row[0] != session_applicant_id:
        conn.close()
        raise HTTPException(status_code=404, detail="Application not found.")

    cur.execute("""
        UPDATE applications
        SET last_seen = ?
        WHERE id = ?
    """, (datetime.utcnow().isoformat(), application_id))

    conn.commit()
    conn.close()

    return {"ok": True}

#=================================================
# CLEANUP ABANDONED INTERVIEWS
#================================================
@app.post("/interview/cleanup-abandoned")
def cleanup_abandoned(sess: dict = Depends(get_current_hr)):
    hr_id = int(sess.get("hr_id"))  # type: ignore[arg-type]

    conn = sqlite3.connect(DB_PATH, isolation_level=None)
    cur = conn.cursor()

    timeout = (datetime.utcnow() - timedelta(minutes=2)).isoformat()

    # Only clean up interviews for the authenticated HR's own job postings
    cur.execute("""
        UPDATE applications
        SET interview_status = 'Abandoned'
        WHERE interview_status = 'In Progress'
        AND (last_seen IS NULL OR last_seen < ?)
        AND id IN (
            SELECT app.id FROM applications app
            JOIN hr_job_posts j ON app.job_id = j.id
            WHERE j.hr_id = ?
        )
    """, (timeout, hr_id))

    conn.commit()
    conn.close()

    return {"status": "cleaned"}


# =================================================
# DATABASE
# =================================================
from config.paths import DB_PATH, PROFILE_IMG_DIR, resolve_stored_path

ALLOWED_PIC_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}

# =================================================
# ENSURE REQUIRED COLUMNS EXIST (SAFE MIGRATION)
# =================================================
def ensure_application_columns():
    conn = sqlite3.connect(DB_PATH, isolation_level=None)
    cur = conn.cursor()

    cur.execute("PRAGMA table_info(applications)")
    columns = [col[1] for col in cur.fetchall()]

    required_columns = {
        "status": "TEXT DEFAULT 'pending'",
        "interview_code": "TEXT",
        "interview_status": "TEXT",
        "interview_expires_at": "TEXT",
        "reissue_requested": "INTEGER DEFAULT 0",
        "reissue_count": "INTEGER DEFAULT 0",
        "last_seen": "TEXT",
        "interview_started_at": "TEXT",
        "interview_completed_at": "TEXT",
        "code_email_sent": "INTEGER DEFAULT 0",
        # How the interview code was delivered ('automatic' / 'manual'), so the
        # HR applicant card can show how the code went out. NULL means the code
        # has not been delivered yet.
        "interview_code_send_method": "TEXT",
        # Apply-time match outcome (additive). NULL means the row predates this
        # feature or the evaluation could not run; the HR list resolves those
        # rows from the stored AI report and, failing that, keeps them in the
        # matched bucket so pre-existing applicants never disappear.
        "match_status": "TEXT",
        "match_score": "INTEGER",
        "match_missing_skills": "TEXT"
    }

    added_code_email = False
    for column, definition in required_columns.items():
        if column not in columns:
            cur.execute(f"ALTER TABLE applications ADD COLUMN {column} {definition}")
            if column == "code_email_sent":
                added_code_email = True

    if added_code_email:
        # One-time backfill: treat already-generated interview codes as sent so
        # the UI shows "Interview Code Sent" for applicants emailed before this
        # migration. Runs only on the first add of the column.
        cur.execute(
            "UPDATE applications SET code_email_sent = 1 "
            "WHERE interview_code IS NOT NULL AND trim(interview_code) != ''"
        )

    conn.commit()
    conn.close()

ensure_application_columns()

# Additive, PRAGMA-guarded post-interview decision columns (final_decision,
# final_decision_source, final_decision_score, final_decision_at,
# decision_email_sent) plus the per-HR automatic-decision switch. Keeping the
# decision on the existing applications row keeps ONE source of truth for the
# HR list, the applicant view and the reports.
ensure_decision_columns(DB_PATH)


# =================================================
# ENSURE INTERVIEW-REPORT / PROCTORING SCHEMA (SAFE MIGRATION)
# Additive only: an existing report row or interview is never modified or
# dropped. `applicant_id` is required by /interview/submit-report; it is
# nullable so pre-existing rows (and the synthetic test seed) stay valid.
# =================================================
def ensure_interview_report_columns():
    conn = sqlite3.connect(DB_PATH, isolation_level=None)
    cur = conn.cursor()

    cur.execute("PRAGMA table_info(interview_reports)")
    columns = [col[1] for col in cur.fetchall()]

    if "applicant_id" not in columns:
        cur.execute("ALTER TABLE interview_reports ADD COLUMN applicant_id TEXT")

    conn.commit()
    conn.close()


ensure_interview_report_columns()
ensure_proctoring_schema()

# =================================================
# MODELS
# =================================================
class ResumeReport(BaseModel):
    applicant_id: str
    job_id: int
    matched: bool
    matched_skills: List[str]
    resume_filename: str

class InterviewReportPayload(BaseModel):
    application_id: int
    domain: str
    answers: Dict[str, list]
    analysis: Dict[str, list]
    applicant_id: Optional[str] = None

class FinalDecisionPayload(BaseModel):
    """Body of the final post-interview HR decision (SELECT / REJECT)."""
    application_id: int
    # 'selected' keeps the candidate in the process, 'rejected' ends it.
    decision: str

# Interview states in which the SERVER has ended the interview by proctoring.
# Such an interview is terminal: it cannot be resumed and cannot be completed by
# submitting a report (see /interview/submit-report).
TERMINATED_INTERVIEW_STATUSES = ("Violated", "Terminated")

# =================================================
# APPLICANT PROFILE
# =================================================
@app.get("/applicant/profile/{applicant_id}")
def get_applicant_profile(applicant_id: str, sess: dict = Depends(get_current_user)):
    """Own profile for an applicant; candidate profile for the HR that owns an
    application from that candidate (used by the applicant review panel)."""
    if sess.get("role") == "hr":
        # A recruiter may only open candidates who applied to their own jobs.
        require_hr_owns_applicant(current_hr_id(sess), applicant_id)
    else:
        applicant_id = require_applicant_ownership(applicant_id, sess)
    conn = sqlite3.connect(DB_PATH, isolation_level=None)
    cur = conn.cursor()

    cur.execute("""
        SELECT
            full_name,
            email,
            phone,
            experience_years,
            skills,
            location,
            profile_pic
        FROM applicants
        WHERE id = ?
    """, (applicant_id,))

    row = cur.fetchone()
    conn.close()

    if not row:
        return {}

    return {
        "full_name": row[0],
        "email": row[1],
        "phone": row[2],
        "experience": row[3],
        "skills": row[4],
        "location": row[5],
        "profile_pic": row[6]
    }

# =================================================
# UPDATE APPLICANT PROFILE
# =================================================
@app.post("/applicant/update-profile")
def update_applicant_profile(data: dict, sess: dict = Depends(get_current_applicant)):
    applicant_id = require_applicant_ownership(data.get("applicant_id"), sess)
    conn = sqlite3.connect(DB_PATH, isolation_level=None)
    cur = conn.cursor()

    cur.execute("""
        UPDATE applicants
        SET
            full_name = ?,
            phone = ?,
            experience_years = ?,
            skills = ?,
            location = ?
        WHERE id = ?
    """, (
        data.get("full_name"),
        data.get("phone"),
        data.get("experience"),
        data.get("skills"),
        data.get("location"),
        applicant_id
    ))

    conn.commit()
    conn.close()

    return {"success": True}

# =================================================
# UPDATE APPLICANT PROFILE PIC
# =================================================
@app.post("/applicant/update-profile-pic")
def update_profile_pic(data: dict, sess: dict = Depends(get_current_applicant)):
    applicant_id = require_applicant_ownership(data.get("applicant_id"), sess)
    conn = sqlite3.connect(DB_PATH, isolation_level=None)
    cur = conn.cursor()

    cur.execute("""
        UPDATE applicants
        SET profile_pic = ?
        WHERE id = ?
    """, (
        data.get("profile_pic"),
        applicant_id
    ))

    conn.commit()
    conn.close()

    return {"success": True}

# =================================================
# UPLOAD APPLICANT PROFILE PICTURE
# Saves the uploaded image to the existing
# data/profile_images/{id}.{ext} storage location and
# records the relative path in applicants.profile_pic.
# =================================================
@app.post("/applicant/upload-profile-pic")
async def upload_profile_pic(applicant_id: str = Form(...), file: UploadFile = File(...), sess: dict = Depends(get_current_applicant)):
    applicant_id = require_applicant_ownership(applicant_id, sess)
    safe_id = re.sub(r"[^A-Za-z0-9_-]", "", applicant_id or "")
    if not safe_id:
        raise HTTPException(status_code=400, detail="Invalid applicant id")

    original_name = file.filename or ""
    ext = os.path.splitext(original_name)[1].lower()
    if ext not in ALLOWED_PIC_EXTS:
        raise HTTPException(status_code=400, detail="Unsupported image format. Use PNG, JPG, WEBP or GIF.")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    if len(data) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image too large. Maximum 2 MB.")

    os.makedirs(PROFILE_IMG_DIR, exist_ok=True)
    target = os.path.join(PROFILE_IMG_DIR, f"{safe_id}{ext}")
    with open(target, "wb") as f:
        f.write(data)

    stored_path = os.path.join("data", "profile_images", f"{safe_id}{ext}")

    conn = sqlite3.connect(DB_PATH, isolation_level=None)
    conn.execute("UPDATE applicants SET profile_pic = ? WHERE id = ?", (stored_path, applicant_id))
    conn.commit()
    conn.close()

    return {"success": True, "profile_pic": stored_path}

# =================================================
# SERVE APPLICANT PROFILE PICTURE
# =================================================
@app.get("/applicant/profile-pic/{applicant_id}")
def get_profile_pic(applicant_id: str, sess: dict = Depends(get_current_applicant)):
    applicant_id = require_applicant_ownership(applicant_id, sess)
    safe_id = re.sub(r"[^A-Za-z0-9_-]", "", applicant_id or "")
    if not safe_id:
        raise HTTPException(status_code=404, detail="Profile picture not found")

    conn = sqlite3.connect(DB_PATH, isolation_level=None)
    row = conn.execute("SELECT profile_pic FROM applicants WHERE id = ?", (applicant_id,)).fetchone()
    conn.close()

    candidates = []
    if row and row[0]:
        candidates.append(resolve_stored_path(str(row[0])))
    candidates.append(os.path.join(PROFILE_IMG_DIR, f"{safe_id}.png"))

    for candidate in candidates:
        if os.path.exists(candidate):
            ext = os.path.splitext(candidate)[1].lower()
            media = "image/png"
            if ext in (".jpg", ".jpeg"):
                media = "image/jpeg"
            elif ext == ".webp":
                media = "image/webp"
            elif ext == ".gif":
                media = "image/gif"
            return FileResponse(candidate, media_type=media)

    raise HTTPException(status_code=404, detail="Profile picture not found")

# =================================================
# GET RESUME REPORT (HR VIEW)
# =================================================
@app.get("/hr/resume-report/{application_id}")
def get_resume_report(application_id: int, sess: dict = Depends(get_current_hr)):
    from services.resume_evaluation import get_or_build_evaluation
    _hr = int(sess.get("hr_id"))  # type: ignore[arg-type]
    conn = sqlite3.connect(DB_PATH, isolation_level=None)
    try:
        row = conn.execute(
            "SELECT j.hr_id FROM applications app JOIN hr_job_posts j ON app.job_id = j.id WHERE app.id = ?",
            (application_id,),
        ).fetchone()
    finally:
        conn.close()
    if not row or int(row[0]) != _hr:
        raise HTTPException(status_code=404, detail="Report not found.")

    return get_or_build_evaluation(DB_PATH, application_id)

# =================================================
# SUBMIT RESUME REPORT
# =================================================
@app.post("/applicant/submit-resume-report")
def submit_resume_report(payload: ResumeReport, sess: dict = Depends(get_current_applicant)):
    applicant_id = require_applicant_ownership(payload.applicant_id, sess)
    conn = sqlite3.connect(DB_PATH, isolation_level=None)
    cur = conn.cursor()

    cur.execute("""
        SELECT id FROM applications
        WHERE applicant_id = ? AND job_id = ?
    """, (applicant_id, payload.job_id))

    row = cur.fetchone()
    if not row:
        conn.close()
        return {"error": "Application not found"}

    application_id = row[0]

    cur.execute("""
        INSERT OR REPLACE INTO resume_reports (
            application_id,
            matched,
            matched_skills,
            resume_filename,
            created_at
        )
        VALUES (?, ?, ?, ?, ?)
    """, (
        application_id,
        payload.matched,
        ",".join(payload.matched_skills),
        payload.resume_filename,
        datetime.utcnow().isoformat()
    ))

    conn.commit()
    conn.close()

    return {"message": "Resume report saved"}

# =================================================
# HR UPDATE APPLICANT STATUS
# =================================================
def _apply_application_status(application_id, status: str, hr_id: int) -> bool:
    """Set ``status`` on ONE application owned by ``hr_id``.

    Shared by the single-record endpoint and the bulk endpoint so ownership
    checks, the stored status and the applicant notification can never drift
    apart. Returns False when the application does not exist or belongs to
    another company (the caller then decides between a 404 and a skipped row).
    """
    decision = (status or "").strip().lower()
    if not decision:
        return False

    # Robust connection (same pattern as auth routers): WAL + busy timeout
    # avoids "database is locked" when concurrent reads/writes occur.
    conn = sqlite3.connect(DB_PATH, timeout=30, check_same_thread=False, isolation_level=None)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA busy_timeout=30000;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    cur = conn.cursor()

    # Ownership first: an application of another company is never touched and
    # never even acknowledged.
    cur.execute("""
        SELECT j.hr_id FROM applications app
        JOIN hr_job_posts j ON app.job_id = j.id
        WHERE app.id = ?
    """, (application_id,))
    owner = cur.fetchone()
    if not owner or int(owner[0]) != hr_id:
        conn.close()
        return False

    # Candidate/job names for the applicant notification (read before closing).
    cur.execute("""
        SELECT app.applicant_id, a.full_name, j.job_title
        FROM applications app
        JOIN applicants a ON app.applicant_id = a.id
        JOIN hr_job_posts j ON app.job_id = j.id
        WHERE app.id = ?
    """, (application_id,))
    row = cur.fetchone()

    cur.execute("""
        UPDATE applications
        SET status = ?
        WHERE id = ? AND id IN (
            SELECT app.id FROM applications app
            JOIN hr_job_posts j ON app.job_id = j.id
            WHERE j.hr_id = ?
        )
    """, (decision, application_id, hr_id))

    conn.commit()
    conn.close()

    # Notify the applicant about the HR decision.
    if row:
        if decision == "approved":
            create_notification(
                applicant_id=row[0],
                application_id=application_id,
                type="application",
                title="Application Shortlisted",
                message=f"{row[1]}, your application for {row[2]} has been shortlisted."
            )
        elif decision == "rejected":
            create_notification(
                applicant_id=row[0],
                application_id=application_id,
                type="application",
                title="Application Not Selected",
                message=f"Thank you for applying to {row[2]}. Your application was not selected this time."
            )

    return True


@app.post("/hr/applicant/status")
def update_applicant_status(data: dict, sess: dict = Depends(get_current_hr)):
    # Validate the body before touching the database.
    application_id = data.get("application_id")
    if not application_id or not data.get("status"):
        raise HTTPException(status_code=400, detail="Missing application_id or status")
    hr_id = int(sess.get("hr_id"))  # type: ignore[arg-type]

    if not _apply_application_status(application_id, data["status"], hr_id):
        raise HTTPException(status_code=404, detail="Application not found.")

    return {"message": "Status updated"}


class BulkApplicationStatusPayload(BaseModel):
    """Body of a bulk approve/reject request (several ids + ONE status)."""
    application_ids: List[int]
    status: str


@app.post("/hr/applicant/status/bulk")
def update_applicant_status_bulk(
    payload: BulkApplicationStatusPayload, sess: dict = Depends(get_current_hr)
):
    """Approve or reject SEVERAL applications in one request.

    Every id is validated individually against the authenticated HR through the
    same helper as the single-record endpoint, so an unknown or foreign
    application is reported back as skipped instead of being modified.
    """
    decision = (payload.status or "").strip().lower()
    if decision not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="status must be 'approved' or 'rejected'")

    # De-duplicate while keeping the caller's order.
    unique_ids = [int(i) for i in dict.fromkeys(payload.application_ids or [])]
    if not unique_ids:
        raise HTTPException(status_code=400, detail="Missing application_ids")

    hr_id = int(sess.get("hr_id"))  # type: ignore[arg-type]
    updated: List[int] = []
    for application_id in unique_ids:
        if _apply_application_status(application_id, decision, hr_id):
            updated.append(application_id)

    return {
        "message": "Status updated",
        "updated": updated,
        "skipped": [i for i in unique_ids if i not in updated],
    }

# =================================================
# FINAL POST-INTERVIEW DECISION (HR)
# =================================================
@app.post("/hr/applicant/decision")
def set_final_decision(payload: FinalDecisionPayload, sess: dict = Depends(get_current_hr)):
    """Record the FINAL post-interview decision for one of this HR's applicants.

    This is the decision that follows a COMPLETED AI interview:

    * ``selected`` - the candidate moves forward;
    * ``rejected`` - the candidate is not selected.

    Guarantees (all enforced in ``services/final_decision.py``):

    * ownership is re-checked against the database, so an HR can never decide on
      another company's applicant;
    * a decision is only possible once the interview is ``Completed``;
    * the decision is recorded exactly ONCE - a refresh, a retry, or a late
      automatic attempt can never overwrite it nor send a second email;
    * the stored score is the authoritative interview score - the same number
      the recruiter sees on the interview report.
    """
    decision = (payload.decision or "").strip().lower()
    if decision not in VALID_DECISIONS:
        raise HTTPException(status_code=400, detail="decision must be 'selected' or 'rejected'")

    result = record_decision(
        DB_PATH,
        payload.application_id,
        decision,
        source=SOURCE_MANUAL,
        hr_id=int(sess.get("hr_id")),  # type: ignore[arg-type]
    )

    status = result.get("status")
    if status == "not_found":
        # Unknown application, or one that belongs to another company.
        raise HTTPException(status_code=404, detail="Application not found.")
    if status == "not_completed":
        raise HTTPException(
            status_code=409,
            detail="The interview is not completed yet, so a final decision cannot be recorded.",
        )
    if status == "conflict":
        raise HTTPException(
            status_code=409,
            detail="This applicant already has the opposite decision.",
        )

    return {
        "message": (
            "Decision already recorded."
            if status == "already_decided"
            else "Decision recorded."
        ),
        "status": status,
        "application_id": payload.application_id,
        "final_decision": result.get("final_decision"),
        "final_decision_source": result.get("final_decision_source"),
        "final_decision_score": result.get("final_decision_score"),
        "already_decided": bool(result.get("already_decided")),
        # False means the decision IS stored but the email could not be sent;
        # the response tells the recruiter instead of hiding a failed send.
        "email_sent": bool(result.get("decision_email_sent")),
    }

class BulkFinalDecisionPayload(BaseModel):
    """Body of a bulk final-decision request (several ids + ONE decision)."""
    application_ids: List[int]
    decision: str


@app.post("/hr/applicant/decision/bulk")
def set_final_decisions_bulk(
    payload: BulkFinalDecisionPayload, sess: dict = Depends(get_current_hr)
):
    """Record the FINAL decision for SEVERAL completed interviews at once.

    Each candidate goes through the exact same server-side rules as the
    single-record endpoint (``services/final_decision.py``): ownership is
    re-checked, the interview must be ``Completed``, the decision is written
    ONCE and the candidate is emailed ONCE. A candidate that cannot be decided
    for any of those reasons is reported in ``skipped`` with its reason instead
    of aborting the whole request, so one ineligible row can never block the
    rest of the selection.
    """
    decision = (payload.decision or "").strip().lower()
    if decision not in VALID_DECISIONS:
        raise HTTPException(status_code=400, detail="decision must be 'selected' or 'rejected'")

    # De-duplicate while keeping the caller's order.
    unique_ids = [int(i) for i in dict.fromkeys(payload.application_ids or [])]
    if not unique_ids:
        raise HTTPException(status_code=400, detail="Missing application_ids")

    hr_id = int(sess.get("hr_id"))  # type: ignore[arg-type]
    recorded: List[int] = []
    skipped: List[Dict[str, object]] = []
    email_sent = 0

    for application_id in unique_ids:
        result = record_decision(
            DB_PATH,
            application_id,
            decision,
            source=SOURCE_MANUAL,
            hr_id=hr_id,
        )
        status = result.get("status")
        # 'recorded' and 'already_decided' both mean the decision is stored.
        if status in ("recorded", "already_decided"):
            recorded.append(application_id)
            if result.get("decision_email_sent"):
                email_sent += 1
        else:
            skipped.append({"application_id": application_id, "reason": status})

    return {
        "message": "Decisions processed",
        "recorded": recorded,
        "skipped": skipped,
        "email_sent": email_sent,
    }


# =================================================
# GENERATE INTERVIEW CODE (HR)
# =================================================
@app.post("/hr/applicant/interview-code")
def generate_interview_code(data: dict, sess: dict = Depends(get_current_hr)):
    # Validate the body before touching the database (a malformed request must
    # be a 400, never an internal 500).
    application_id = data.get("application_id")
    if not application_id:
        raise HTTPException(status_code=400, detail="Missing application_id")
    requesting_hr_id = int(sess.get("hr_id"))  # type: ignore[arg-type]

    # Keep the endpoint's original outcomes: an application that does not exist
    # returns the legacy error payload, while one owned by another HR is a 404.
    conn = sqlite3.connect(DB_PATH, isolation_level=None)
    exists = conn.execute(
        "SELECT 1 FROM applications WHERE id = ?", (application_id,)
    ).fetchone()
    conn.close()
    if not exists:
        return {"error": "Application not found"}

    # Generation, idempotency and delivery live in ONE shared implementation
    # that the automatic (matched-candidate) path also uses, so manual and
    # automatic sending can never produce competing interview codes.
    from services.auto_interview import SEND_METHOD_MANUAL, issue_interview_code

    result = issue_interview_code(
        DB_PATH,
        application_id,
        hr_id=requesting_hr_id,
        send_method=SEND_METHOD_MANUAL,
        job_domain=str(data.get("job_domain") or "") or None,
    )
    if result.get("error"):
        raise HTTPException(status_code=404, detail="Application not found.")
    return result
# =================================================
# VERIFY INTERVIEW CODE (APPLICANT)
# =================================================
@app.post("/applicant/verify-interview-code")
def verify_interview_code(
    data: dict,
    request: Request,
    sess: dict = Depends(get_current_applicant),
):
    """Verify an interview code for the authenticated applicant only.

    The lookup joins the code with the session identity, so an applicant can
    never open (or probe) another applicant's interview - even with a valid
    code - and short codes cannot be guessed without hitting the rate limit.
    """
    applicant_id = current_applicant_id(sess)

    limit_verify_code(applicant_id, request)

    code = str(data.get("interview_code") or "").upper().strip()
    if not code:
        return {"valid": False, "reason": "Invalid interview code"}

    conn = sqlite3.connect(DB_PATH, isolation_level=None)
    cur = conn.cursor()

    cur.execute("""
        SELECT
            app.id,
            app.status,
            app.interview_expires_at,
            app.interview_status,
            j.job_domain
        FROM applications app
        JOIN hr_job_posts j ON app.job_id = j.id
        WHERE app.interview_code = ? AND app.applicant_id = ?
    """, (code, applicant_id))

    row = cur.fetchone()

    if not row:
        conn.close()
        return {"valid": False, "reason": "Invalid interview code"}

    application_id, hr_status, expires_at, interview_status, job_domain = row

    # ❌ Not approved
    if hr_status.lower() != "approved":
        conn.close()
        return {"valid": False, "reason": "Interview not approved by HR"}

    # ❌ Expired — create notification
    if expires_at and datetime.utcnow() > datetime.fromisoformat(expires_at):

        cur.execute("""
            UPDATE applications
            SET interview_status = 'Expired'
            WHERE id = ?
        """, (application_id,))

        # Get hr_id for notification
        cur.execute("""
            SELECT j.hr_id, a.full_name
            FROM applications app
            JOIN hr_job_posts j ON app.job_id = j.id
            JOIN applicants a ON app.applicant_id = a.id
            WHERE app.id = ?
        """, (application_id,))
        notify_row = cur.fetchone()
        if notify_row:
            hr_id_for_notify, candidate_name = notify_row
            create_notification(
                hr_id=hr_id_for_notify,
                application_id=application_id,
                type="interview_status",
                title="Interview Expired",
                message=f"{candidate_name}'s interview code has expired."
            )

        conn.commit()
        conn.close()

        return {
            "valid": False,
            "reason": "Interview code expired",
            "can_request_reissue": True,
            "application_id": application_id
        }

    # ❌ Already used
    if interview_status in ("In Progress", "Completed"):
        conn.close()
        return {"valid": False, "reason": "Interview already used"}
    if interview_status in ("Abandoned", "Violated", "Terminated"):
        conn.close()
        return {"valid": False, "reason": "Interview is no longer active"}

    # ✅ VALID — Start Interview
    started_at = datetime.utcnow().isoformat()
    cur.execute("""
        UPDATE applications
        SET interview_status = 'In Progress',
            interview_started_at = ?,
            last_seen = ?
        WHERE id = ?
    """, (started_at, started_at, application_id))

    # Get hr_id for notification before closing
    cur.execute("""
        SELECT j.hr_id, a.full_name
        FROM applications app
        JOIN hr_job_posts j ON app.job_id = j.id
        JOIN applicants a ON app.applicant_id = a.id
        WHERE app.id = ?
    """, (application_id,))
    notify_row = cur.fetchone()

    conn.commit()
    conn.close()

    if notify_row:
        hr_id_for_notify, candidate_name = notify_row
        create_notification(
            hr_id=hr_id_for_notify,
            application_id=application_id,
            type="interview_status",
            title="Interview Started",
            message=f"{candidate_name} has started the interview."
        )

    return {
        "valid": True,
        "application_id": application_id,
        "job_domain": job_domain,
        # Authoritative interview start time (UTC ISO). The client uses this as
        # the timer origin so a refresh or edited local storage cannot extend
        # the interview window.
        "interview_started_at": started_at,
    }

# =================================================
# REQUEST INTERVIEW REISSUE (APPLICANT)
# =================================================
@app.post("/applicant/request-reissue")
def request_reissue(data: dict, sess: dict = Depends(get_current_applicant)):
    applicant_id = current_applicant_id(sess)
    application_id = data.get("application_id")

    # Authorization: only the owner of the application can request a reissue.
    require_applicant_owns_application(applicant_id, application_id)

    conn = sqlite3.connect(DB_PATH, isolation_level=None)
    cur = conn.cursor()

    cur.execute("""
        SELECT reissue_count, interview_status
        FROM applications
        WHERE id = ?
    """, (application_id,))
    row = cur.fetchone()

    if not row:
        conn.close()
        return {"success": False, "reason": "Application not found"}

    reissue_count, status = row

    if reissue_count >= 1:
        conn.close()
        return {"success": False, "reason": "Reissue limit reached"}

    if status != "Expired":
        conn.close()
        return {"success": False, "reason": "Reissue not allowed"}

    cur.execute("""
        UPDATE applications
        SET reissue_requested = 1
        WHERE id = ?
    """, (application_id,))

    conn.commit()
    conn.close()

    # Create notification for reissue requested
    conn2 = sqlite3.connect(DB_PATH, isolation_level=None)
    cur2 = conn2.cursor()
    cur2.execute("""
        SELECT j.hr_id FROM applications app
        JOIN hr_job_posts j ON app.job_id = j.id
        WHERE app.id = ?
    """, (application_id,))
    notify_row = cur2.fetchone()
    conn2.close()
    if notify_row:
        create_notification(
            hr_id=notify_row[0],
            application_id=application_id,
            type="reissue",
            title="Interview Reissue Requested",
            message="An applicant has requested a new interview code."
        )

    return {"success": True}

# =================================================
# SUBMIT INTERVIEW REPORT
# =================================================
@app.post("/interview/submit-report")
def submit_interview_report(
    payload: InterviewReportPayload,
    sess: dict = Depends(get_current_applicant),
):
    """Protected: only the authenticated applicant who owns the application
    may submit this report. The applicant_id in the session is authoritative;
    any applicant_id sent in the body is ignored for authorization.
    """
    session_applicant_id = str(sess.get("applicant_id") or "")
    if not session_applicant_id:
        raise HTTPException(status_code=403, detail="Authentication required.")

    # Bound repeated submissions per applicant (existing in-process limiter).
    limit_interview_submit(session_applicant_id)

    conn = sqlite3.connect(DB_PATH, isolation_level=None)
    cur = conn.cursor()

    # Verify the application exists and belongs to this applicant
    cur.execute(
        "SELECT id, applicant_id FROM applications WHERE id = ?",
        (payload.application_id,),
    )
    row = cur.fetchone()
    if not row or row[1] != session_applicant_id:
        conn.close()
        raise HTTPException(status_code=404, detail="Application not found.")

    application_id = row[0]

    # Server-authoritative eligibility: an interview the SERVER terminated by
    # proctoring can never be completed by submitting a report. Accepting it
    # would erase the persisted termination state (and let a client that kept
    # running after 'Violated' wipe its own violation record). The violation
    # rows and the 'Violated' status stay authoritative.
    cur.execute(
        "SELECT interview_status FROM applications WHERE id = ?",
        (payload.application_id,),
    )
    status_row = cur.fetchone()
    interview_status = status_row[0] if status_row else None
    if interview_status in TERMINATED_INTERVIEW_STATUSES:
        conn.close()
        return {
            "success": False,
            "terminated": True,
            "duplicate": False,
            "reason": "This interview was terminated by proctoring and cannot be submitted.",
        }

    # Idempotency: a re-submission of the SAME interview by the SAME applicant
    # (double click, retry after a timeout, resumed submission) must not create
    # a second report, a second completion transition or a second round of
    # notifications. Ownership was already re-verified above, so this can only
    # ever be the caller's own interview.
    cur.execute(
        "SELECT id FROM interview_reports WHERE application_id = ?",
        (payload.application_id,),
    )
    if cur.fetchone() is not None:
        conn.close()
        return {"success": True, "duplicate": True}

    # Save interview report (authoritative applicant_id derived from session).
    # A concurrent identical submission is caught by the UNIQUE(application_id)
    # constraint and treated as a duplicate instead of a server error.
    try:
        cur.execute(
            """
            INSERT INTO interview_reports (
                application_id,
                domain,
                answers_json,
                analysis_json,
                applicant_id,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                payload.application_id,
                payload.domain,
                json.dumps(payload.answers),
                json.dumps(payload.analysis),
                session_applicant_id,
                datetime.utcnow().isoformat(),
            ),
        )
    except sqlite3.IntegrityError:
        conn.close()
        return {"success": True, "duplicate": True}

    # FORCE mark as Completed and clear any stale reissue flag
    cur.execute(
        """
        UPDATE applications
        SET interview_status = 'Completed',
            interview_completed_at = ?,
            reissue_requested = 0,
            last_seen = NULL
        WHERE id = ?
        """,
        (datetime.utcnow().isoformat(), payload.application_id),
    )

    conn.commit()
    conn.close()

    # Create notification for interview completed
    conn2 = sqlite3.connect(DB_PATH, isolation_level=None)
    cur2 = conn2.cursor()
    cur2.execute(
        """
        SELECT j.hr_id, a.full_name FROM applications app
        JOIN hr_job_posts j ON app.job_id = j.id
        JOIN applicants a ON app.applicant_id = a.id
        WHERE app.id = ?
        """,
        (payload.application_id,),
    )
    notify_row = cur2.fetchone()
    conn2.close()
    if notify_row:
        hr_id_for_notify, candidate_name = notify_row
        create_notification(
            hr_id=hr_id_for_notify,
            application_id=payload.application_id,
            type="interview_status",
            title="Interview Completed",
            message=f"{candidate_name}'s interview has been completed.",
        )

    # Notify the applicant that the interview is complete + report available.
    create_notification(
        applicant_id=session_applicant_id,
        application_id=payload.application_id,
        type="report_available",
        title="Interview Completed",
        message="Your interview has been completed and your feedback report is now available.",
    )

    # POST-INTERVIEW DECISION (automatic mode). The interview is really
    # completed at this point, so when this HR has the automatic-decision switch
    # ON the decision is recorded here, from the same score the HR report shows.
    # It never raises and never changes the submission result, so a decision
    # problem can never break an applicant's interview submission.
    maybe_auto_decide(DB_PATH, payload.application_id)

    return {"success": True}

# =================================================
# ABANDON INTERVIEW
# =================================================
@app.post("/interview/abandon")
def abandon_interview(
    payload: dict,
    sess: dict = Depends(get_current_applicant),
):
    """Protected: only the authenticated applicant who owns the application
    may abandon their own interview.
    """
    session_applicant_id = str(sess.get("applicant_id") or "")
    if not session_applicant_id:
        raise HTTPException(status_code=403, detail="Authentication required.")

    application_id = payload.get("application_id")
    if not application_id:
        raise HTTPException(status_code=400, detail="Missing application_id")

    conn = sqlite3.connect(DB_PATH, isolation_level=None)
    cur = conn.cursor()

    # Verify ownership before modifying state
    cur.execute(
        "SELECT applicant_id FROM applications WHERE id = ?", (application_id,)
    )
    row = cur.fetchone()
    if not row or row[0] != session_applicant_id:
        conn.close()
        raise HTTPException(status_code=404, detail="Application not found.")

    # Only mark abandoned if still in progress
    cur.execute(
        """
        UPDATE applications
        SET interview_status = 'Abandoned'
        WHERE id = ?
        AND interview_status = 'In Progress'
        """,
        (application_id,),
    )

    conn.commit()
    conn.close()

    # Create notification for abandoned interview
    conn2 = sqlite3.connect(DB_PATH, isolation_level=None)
    cur2 = conn2.cursor()
    cur2.execute(
        """
        SELECT j.hr_id, a.full_name FROM applications app
        JOIN hr_job_posts j ON app.job_id = j.id
        JOIN applicants a ON app.applicant_id = a.id
        WHERE app.id = ?
        """,
        (application_id,),
    )
    notify_row = cur2.fetchone()
    conn2.close()
    if notify_row:
        hr_id_for_notify, candidate_name = notify_row
        create_notification(
            hr_id=hr_id_for_notify,
            application_id=application_id,
            type="interview_status",
            title="Interview Abandoned",
            message=f"{candidate_name}'s interview has been marked as abandoned.",
        )

    return {"success": True}

# =================================================
# VIOLATE INTERVIEW
# =================================================
@app.post("/interview/violate")
def violate_interview(
    payload: dict,
    sess: dict = Depends(get_current_applicant),
):
    """Protected: record ONE proctoring violation against the caller's own interview.

    Phase 3: the server owns the warning count, the violation state and the
    termination decision. The client may only report the event type — sending
    this endpoint no longer terminates an interview outright; the interview is
    terminated when the server-side policy says so (3 warnings, or a
    server-terminating event such as 'camera_blocked').

    Kept for backwards compatibility with earlier clients; the SPA uses
    POST /interview/proctoring-event.
    """
    session_applicant_id = str(sess.get("applicant_id") or "")
    if not session_applicant_id:
        raise HTTPException(status_code=403, detail="Authentication required.")

    application_id = payload.get("application_id")
    if not application_id:
        raise HTTPException(status_code=400, detail="Missing application_id")

    event_type = str(payload.get("event_type") or "manual").strip().lower()
    return record_proctoring_event(application_id, session_applicant_id, event_type)

# =================================================
# GET DETAILED INTERVIEW REPORT (HR)
# =================================================
@app.get("/hr/interview-report/{application_id}")
def get_interview_report(
    application_id: int,
    sess: dict = Depends(get_current_hr),
):
    """
    Protected: HR-only access to interview reports, scoped to the HR's own company.
    Authorization: the application must belong to a job post owned by this HR.
    """
    hr_id = int(sess.get("hr_id"))  # type: ignore[arg-type]
    conn = sqlite3.connect(DB_PATH, isolation_level=None)
    cur = conn.cursor()
    cur.execute(
        """
        SELECT j.hr_id
        FROM applications app
        JOIN hr_job_posts j ON app.job_id = j.id
        WHERE app.id = ?
        """,
        (application_id,),
    )
    owner = cur.fetchone()
    conn.close()
    if not owner or int(owner[0]) != hr_id:
        raise HTTPException(status_code=404, detail="Interview report not found.")

    conn = sqlite3.connect(DB_PATH, isolation_level=None)
    # Bug fix: the previous connection was closed above, so the cursor has to
    # be recreated for this connection before it is used again.
    cur = conn.cursor()

    cur.execute("""
        SELECT
            a.full_name,
            a.email,
            j.job_title,
            j.job_domain,
            ir.answers_json,
            ir.analysis_json,
            ir.created_at,
            app.interview_started_at,
            app.interview_completed_at
        FROM interview_reports ir
        JOIN applications app ON ir.application_id = app.id
        JOIN applicants a ON app.applicant_id = a.id
        JOIN hr_job_posts j ON app.job_id = j.id
        WHERE ir.application_id = ?
        AND j.hr_id = ?
    """, (application_id, hr_id))

    row = cur.fetchone()
    conn.close()

    if not row:
        return {"error": "Interview report not found"}

    name, email, job_title, job_domain, answers_json, analysis_json, created_at, started_at, completed_at = row

    answers = json.loads(answers_json or "{}")
    analysis = json.loads(analysis_json or "{}")

    # Scoring comes from the single shared implementation
    # (services/interview_scoring.py) so the HR report and the automatic
    # SELECT / REJECT decision can never disagree. The formula is unchanged.
    score = score_from_analysis(analysis, answers)
    round_details = score["rounds"]
    overall = score["overall_score"]
    total_questions = score["total_questions"]
    verdict = score["verdict"]
    reliability_note = score["reliability_note"]

    return {
        "candidate_name": name,
        "candidate_email": email,
        "job_title": job_title,
        "job_domain": job_domain,
        "completed_at": created_at,
        "interview_started_at": started_at,
        "interview_completed_at": completed_at,
        "total_questions": total_questions,
        "scoring_scale": "Each question is scored out of 10 by AI. Round averages are converted to percentages, then weighted: Technical 50%, Aptitude 30%, Soft Skills 20%.",
        "overall_score": overall,
        "verdict": verdict,
        "reliability_note": reliability_note,
        "primary_improvement_area": score["primary_improvement_area"],
        "rounds": round_details
    }

# =================================================
# GET APPLIED POSITIONS (APPLICANT)
# =================================================
@app.get("/applicant/applied-positions/{applicant_id}")
def get_applied_positions(
    applicant_id: str,
    sess: dict = Depends(get_current_applicant),
):
    """Protected: only the authenticated applicant may view their own
    applied positions. The applicant_id in the session is authoritative.
    """
    require_applicant_ownership(applicant_id, sess)
    conn = sqlite3.connect(DB_PATH, isolation_level=None)
    cur = conn.cursor()

    cur.execute("""
        SELECT
            app.id,
            j.id,
            j.job_title,
            h.company_name,
            app.applied_at,
            app.status,
            app.interview_status,
            app.interview_code,
            app.interview_expires_at,
            app.reissue_requested,
            app.interview_started_at,
            app.interview_completed_at,
            CASE WHEN ir.id IS NULL THEN 0 ELSE 1 END AS has_report,
            app.final_decision,
            app.final_decision_at
        FROM applications app
        JOIN hr_job_posts j ON app.job_id = j.id
        JOIN hr_users h ON j.hr_id = h.id
        LEFT JOIN interview_reports ir ON ir.application_id = app.id
        WHERE app.applicant_id = ?
        ORDER BY app.applied_at DESC
    """, (applicant_id,))

    rows = cur.fetchall()
    conn.close()

    results = []
    for r in rows:
        results.append({
            "application_id": r[0],
            "job_id": r[1],
            "job_title": r[2],
            "company": r[3],
            "applied_date": r[4],
            "status": r[5],
            "interview_status": r[6],
            "interview_code": r[7],
            "interview_expires_at": r[8],
            "reissue_requested": r[9],
            "interview_started_at": r[10],
            "interview_completed_at": r[11],
            "has_report": bool(r[12]),
            # FINAL post-interview outcome ('selected' | 'rejected'), recorded
            # only after the interview is completed. NULL = no decision yet.
            # The applicant sees the outcome; the internal provenance
            # (manual / automatic) stays on the HR side.
            "final_decision": r[13] or None,
            "final_decision_at": r[14] or None,
        })

    return results

# =================================================
# GET ALL RESUME REPORTS (HR LIST VIEW)
# =================================================
@app.get("/hr/resume-reports/{hr_id}")
def get_all_resume_reports(hr_id: int, sess: dict = Depends(get_current_hr)):
    # Authorization: resume reports are limited to the HR's own job postings.
    hr_id = require_hr_ownership(hr_id, sess)
    conn = sqlite3.connect(DB_PATH, isolation_level=None)
    cur = conn.cursor()

    cur.execute("""
        SELECT
            app.id AS application_id,
            a.full_name,
            a.email,
            j.job_title,
            j.job_domain,
            app.applied_at,
            app.status,
            app.interview_status,
            app.interview_code,
            app.interview_expires_at,
            app.reissue_requested,
            app.reissue_count
        FROM applications app
        JOIN applicants a ON app.applicant_id = a.id
        JOIN hr_job_posts j ON app.job_id = j.id
        WHERE j.hr_id = ?
        ORDER BY app.applied_at DESC
    """, (hr_id,))

    rows = cur.fetchall()
    conn.close()

    results = []
    for r in rows:
        results.append({
            "application_id": r[0],
            "full_name": r[1],
            "email": r[2],
            "job_title": r[3],
            "job_domain": r[4],
            "applied_at": r[5],              # <-- Add this
            "status": r[6],
            "interview_status": r[7],
            "interview_code": r[8],
            "interview_expires_at": r[9],
            "reissue_requested": r[10],
            "reissue_count": r[11]
        })

    return results

# =================================================
# REGENERATE INTERVIEW CODE (HR)
# =================================================
@app.post("/hr/applicant/regenerate-interview-code")
def regenerate_interview_code(data: dict, sess: dict = Depends(get_current_hr)):
    application_id = data.get("application_id")
    if not application_id:
        raise HTTPException(status_code=400, detail="Missing application_id")

    # Authorization: an HR may only regenerate codes for their own job's
    # applications.
    require_hr_owns_application(current_hr_id(sess), application_id)

    conn = sqlite3.connect(DB_PATH, isolation_level=None)
    cur = conn.cursor()

    # Fetch job domain and applicant email
    cur.execute("""
        SELECT
            j.job_domain,
            a.email,
            a.id
        FROM applications app
        JOIN hr_job_posts j ON app.job_id = j.id
        JOIN applicants a ON app.applicant_id = a.id
        WHERE app.id = ?
    """, (application_id,))
    row = cur.fetchone()

    if not row:
        conn.close()
        return {"error": "Application not found"}

    job_domain, applicant_email, applicant_id = row

    domain_code = job_domain[:2].upper()
    new_code = f"QUNO-{domain_code}-{random.randint(10000, 99999)}"
    expires_at = (datetime.utcnow() + timedelta(hours=24)).isoformat()

    cur.execute("""
        UPDATE applications
        SET interview_code = ?,
            interview_status = 'Not Started',
            interview_expires_at = ?,
            reissue_requested = 0,
            reissue_count = reissue_count + 1
        WHERE id = ?
    """, (new_code, expires_at, application_id))

    # Fetch hr_id for notification
    cur.execute("""
        SELECT j.hr_id FROM hr_job_posts j
        JOIN applications app ON app.job_id = j.id
        WHERE app.id = ?
    """, (application_id,))
    hr_row = cur.fetchone()

    conn.commit()
    conn.close()

    # Send the new interview code by email and record whether SMTP accepted it.
    email_sent = False
    if applicant_email:
        try:
            send_interview_email(applicant_email, new_code, job_domain)
            email_sent = True
        except Exception:
            logger.exception(
                "Failed to send regenerated interview code email for application_id=%s",
                application_id
            )

    # Persist the email-sent state so the UI stays consistent on refresh. The
    # delivery method keeps its original value when the code had already been
    # delivered (COALESCE), so a manual reissue never rewrites the provenance.
    conn = sqlite3.connect(DB_PATH, isolation_level=None)
    cur = conn.cursor()
    cur.execute(
        "UPDATE applications SET code_email_sent = ?, "
        "interview_code_send_method = COALESCE(interview_code_send_method, ?) "
        "WHERE id = ?",
        (1 if email_sent else 0, "manual" if email_sent else None, application_id),
    )
    conn.commit()
    conn.close()

    # Create notification for code regeneration
    if hr_row:
        create_notification(
            hr_id=hr_row[0],
            application_id=application_id,
            type="interview_code",
            title="Interview Code Regenerated",
            message="A new interview code has been generated for an applicant."
        )

    # Notify the applicant that their interview access was reissued.
    create_notification(
        applicant_id=applicant_id,
        application_id=application_id,
        type="interview_code",
        title="Interview Access Reissued",
        message="Your interview access has been reissued. A new code is ready - check My Applications."
    )

    result = {
        "interview_code": new_code,
        "expires_at": expires_at,
        "email_sent": email_sent,
        "code_email_sent": 1 if email_sent else 0,
    }
    if not email_sent:
        result["warning"] = (
            "A new interview code was generated, but email delivery failed. "
            "Please share the code with the applicant manually."
        )
    return result
# =================================================
# RESET INTERVIEW EXPIRY (HR)
# =================================================
@app.post("/hr/applicant/reset-expiry")
def reset_expiry(data: dict, sess: dict = Depends(get_current_hr)):
    application_id = data.get("application_id")
    if not application_id:
        raise HTTPException(status_code=400, detail="Missing application_id")

    # Authorization: only the HR that owns the application's job can reset it.
    require_hr_owns_application(current_hr_id(sess), application_id)

    conn = sqlite3.connect(DB_PATH, isolation_level=None)
    cur = conn.cursor()

    new_expiry = (datetime.utcnow() + timedelta(hours=24)).isoformat()

    cur.execute("""
        UPDATE applications
        SET interview_expires_at = ?,
            reissue_requested = 0
        WHERE id = ?
    """, (new_expiry, application_id))

    conn.commit()
    conn.close()

    return {"expires_at": new_expiry}

# =================================================
# GET APPLICANT INTERVIEW REPORT
# ================================================= 
@app.get("/applicant/interview-report/{application_id}")
def get_applicant_interview_report(
    application_id: int,
    sess: dict = Depends(get_current_applicant),
):
    # Authorization: the report is resolved from the session identity, so a
    # client-supplied applicant_id is neither required nor trusted.
    applicant_id = current_applicant_id(sess)

    conn = sqlite3.connect(DB_PATH, isolation_level=None)
    cur = conn.cursor()

    cur.execute("""
        SELECT
            j.job_title,
            h.company_name,
            j.job_domain,
            ir.answers_json,
            ir.analysis_json,
            ir.created_at,
            app.applicant_id
        FROM interview_reports ir
        JOIN applications app ON ir.application_id = app.id
        JOIN hr_job_posts j ON app.job_id = j.id
        JOIN hr_users h ON j.hr_id = h.id
        WHERE ir.application_id = ?
    """, (application_id,))

    row = cur.fetchone()
    conn.close()

    if not row:
        return {"error": "Report not found"}

    # Ownership: the report must belong to the authenticated applicant.
    if row[6] != applicant_id:
        return {"error": "Report not found"}

    job_title, company_name, job_domain, answers_json, analysis_json, created_at, _ = row
    analysis = json.loads(analysis_json or "{}")
    answers = json.loads(answers_json or "{}")

    round_labels = {"technical": "Technical", "aptitude": "Aptitude", "soft_skills": "Soft Skills"}
    rounds = {}
    strengths = []
    improvements = []
    feedback_items = []
    total = 0.0
    count = 0

    for round_key, label in round_labels.items():
        items = analysis.get(round_key, [])
        if not items:
            rounds[round_key] = {
                "label": label, "question_count": 0,
                "average_out_of_10": 0, "average_percent": 0
            }
            continue
        avg = sum(float(it.get("score", 0) or 0) for it in items) / len(items)
        rounds[round_key] = {
            "label": label,
            "question_count": len(items),
            "average_out_of_10": round(avg, 1),
            "average_percent": int(avg * 10),
        }
        ans_items = answers.get(round_key, [])
        for i, it in enumerate(items):
            total += float(it.get("score", 0) or 0)
            count += 1
            for s in (it.get("strengths") or []):
                if s and s not in strengths:
                    strengths.append(s)
            for s in (it.get("improvements") or []):
                if s and s not in improvements:
                    improvements.append(s)
            ans = ans_items[i] if i < len(ans_items) and isinstance(ans_items[i], dict) else {}
            feedback_items.append({
                "round": label,
                "question": ans.get("question", ""),
                "answer": ans.get("answer", ""),
                "summary": it.get("summary", ""),
            })

    overall = int(total / count * 10) if count else 0

    return {
        "application_id": application_id,
        "job_title": job_title,
        "company": company_name,
        "job_domain": job_domain,
        "completed_at": created_at,
        "overall_score": overall,
        "final_result": "Recommended" if overall >= 70 else "Needs Review",
        "rounds": rounds,
        "skills": [
            {"name": rounds["technical"]["label"], "score": rounds["technical"]["average_percent"]},
            {"name": rounds["aptitude"]["label"], "score": rounds["aptitude"]["average_percent"]},
            {"name": rounds["soft_skills"]["label"], "score": rounds["soft_skills"]["average_percent"]},
        ],
        "strengths": strengths[:10],
        "improvements": improvements[:10],
        "feedback": feedback_items,
        "questions_answered": count,
    }

# =================================================
# GET COMPLETED INTERVIEWS (HR DASHBOARD)
# ================================================= 
@app.get("/hr/completed-interviews/{hr_id}")
def get_completed_interviews(hr_id: int, sess: dict = Depends(get_current_hr)):
    hr_id = require_hr_ownership(hr_id, sess)
    conn = sqlite3.connect(DB_PATH, isolation_level=None)
    cur = conn.cursor()

    cur.execute("""
        SELECT
            app.id,
            a.full_name,
            j.job_title,
            app.interview_status,
            app.final_decision,
            app.final_decision_source,
            app.final_decision_score,
            app.final_decision_at
        FROM applications app
        JOIN applicants a ON app.applicant_id = a.id
        JOIN hr_job_posts j ON app.job_id = j.id
        WHERE j.hr_id = ?
        AND app.interview_status = 'Completed'
        ORDER BY app.applied_at DESC
    """, (hr_id,))

    rows = cur.fetchall()
    conn.close()

    return [
        {
            "application_id": r[0],
            "full_name": r[1],
            "job_title": r[2],
            "status": r[3],
            # FINAL post-interview decision, if it was already made (manually by
            # the HR or automatically by the switch). NULL = still undecided.
            # Additive keys: clients that only read the fields above are
            # unaffected.
            "final_decision": r[4] or None,
            "final_decision_source": r[5] or None,
            "final_decision_score": r[6],
            "final_decision_at": r[7] or None,
        }
        for r in rows
    ]

# =================================================
# GET PENDING INTERVIEWS (HR DASHBOARD)
# ================================================= 
@app.get("/hr/pending-interviews/{hr_id}")
def get_pending_interviews(hr_id: int, sess: dict = Depends(get_current_hr)):
    hr_id = require_hr_ownership(hr_id, sess)
    conn = sqlite3.connect(DB_PATH, isolation_level=None)
    cur = conn.cursor()

    cur.execute("""
        SELECT
            app.id,
            a.full_name,
            j.job_title,
            app.interview_status
        FROM applications app
        JOIN applicants a ON app.applicant_id = a.id
        JOIN hr_job_posts j ON app.job_id = j.id
        WHERE j.hr_id = ?
        AND app.interview_status = 'In Progress'
        ORDER BY app.applied_at DESC
    """, (hr_id,))

    rows = cur.fetchall()
    conn.close()

    return [
        {
            "application_id": r[0],
            "full_name": r[1],
            "job_title": r[2],
            "status": r[3]
        }
        for r in rows
    ]

# =================================================
# GET ALL ACTIVE JOBS (HR DASHBOARD)
# ================================================= 
@app.get("/hr/dashboard/active-jobs/{hr_id}")
def get_active_jobs(hr_id: int, sess: dict = Depends(get_current_hr)):
    hr_id = require_hr_ownership(hr_id, sess)
    conn = sqlite3.connect(DB_PATH, isolation_level=None)
    cur = conn.cursor()

    cur.execute("""
        SELECT
            j.id,
            j.job_title,
            j.job_domain,
            COUNT(app.id) as applicant_count
        FROM hr_job_posts j
        LEFT JOIN applications app ON app.job_id = j.id
        WHERE j.hr_id = ? AND j.status = 'Open'
        GROUP BY j.id
        ORDER BY j.created_at DESC
    """, (hr_id,))

    rows = cur.fetchall()
    conn.close()

    return [
        {
            "id": r[0],
            "job_title": r[1],
            "job_domain": r[2],
            "applicants": r[3]
        }
        for r in rows
    ]

# =================================================
# GET ALL APPLICANTS (HR DASHBOARD)
# ================================================= 
@app.get("/hr/dashboard/applicants/{hr_id}")
def get_dashboard_applicants(hr_id: int, sess: dict = Depends(get_current_hr)):
    hr_id = require_hr_ownership(hr_id, sess)
    conn = sqlite3.connect(DB_PATH, isolation_level=None)
    cur = conn.cursor()

    cur.execute("""
        SELECT
            app.id,
            a.full_name,
            a.email,
            j.job_title,
            app.status,
            app.applied_at
        FROM applications app
        JOIN applicants a ON app.applicant_id = a.id
        JOIN hr_job_posts j ON app.job_id = j.id
        WHERE j.hr_id = ? AND j.status = 'Open'
        ORDER BY app.applied_at DESC
    """, (hr_id,))

    rows = cur.fetchall()
    conn.close()

    return [
        {
            "application_id": r[0],
            "full_name": r[1],
            "email": r[2],
            "job_title": r[3],
            "status": r[4],
            "applied_at": r[5]
        }
        for r in rows
    ]

# =================================================
# FORGOT PASSWORD (APPLICANT)
# ================================================= 
@app.post("/auth/forgot-password")
def forgot_password(data: dict, request: Request):
    """Legacy OTP start (superseded by /api/auth/forgot-password).

    The code is stored hashed and never logged, and the response does not
    reveal whether the email is registered.
    """
    email = str(data.get("email") or "").strip().lower()

    limit_password_reset(email, request)

    conn = sqlite3.connect(DB_PATH, isolation_level=None)
    cur = conn.cursor()

    # Check in applicants
    cur.execute("SELECT id FROM applicants WHERE email = ?", (email,))
    user = cur.fetchone()
    role = "applicant"

    # If not found → check HR
    if not user:
        cur.execute("SELECT id FROM hr_users WHERE email = ?", (email,))
        user = cur.fetchone()
        role = "hr"

    if not user:
        conn.close()
        return {"success": True, "message": "If that email is registered, a reset code has been sent."}

    otp = f"{random.randint(0, 999999):06d}"

    cur.execute(_RESET_TABLE_SQL)

    # One live code per address; only the hash is persisted.
    cur.execute("DELETE FROM password_reset WHERE email = ?", (email,))
    cur.execute("""
        INSERT INTO password_reset (email, otp, role, created_at)
        VALUES (?, ?, ?, ?)
    """, (email, _hash_reset_code(otp), role, datetime.utcnow().isoformat()))

    conn.commit()
    conn.close()

    # The code itself is never logged and never returned to the caller.
    return {"success": True, "message": "If that email is registered, a reset code has been sent."}

# =================================================
# VERIFY OTP (APPLICANT)
# ================================================= 
@app.post("/auth/verify-otp")
def verify_otp(data: dict, request: Request):
    """Check a legacy reset code (hashed, unexpired, per-address)."""
    email = str(data.get("email") or "").strip().lower()
    otp = str(data.get("otp") or "").strip()

    # A 6-digit code is guessable without a rate limit.
    limit_verify_code(email, request)

    conn = sqlite3.connect(DB_PATH, isolation_level=None)
    cur = conn.cursor()
    try:
        cur.execute(_RESET_TABLE_SQL)
        valid = _valid_reset_code(cur, email, otp)
    except sqlite3.OperationalError:
        valid = False
    finally:
        conn.close()

    return {"success": bool(valid)}

# =================================================
# RESET PASSWORD
# =================================================
@app.post("/auth/reset-password")
def reset_password(data: dict, request: Request):
    """Complete the legacy OTP reset flow.

    A valid, unexpired, single-use reset code is REQUIRED. Previously any
    anonymous caller could set a new password for any email address here.
    """
    email = str(data.get("email") or "").strip().lower()
    otp = str(data.get("otp") or "").strip()
    new_password = str(data.get("password") or "")

    limit_password_reset(email, request)

    if not _password_policy_ok(new_password):
        raise HTTPException(
            status_code=400,
            detail=(
                "Password must be at least 8 characters and include an uppercase letter, "
                "a lowercase letter, a number and a special character."
            ),
        )

    conn = sqlite3.connect(DB_PATH, isolation_level=None)
    cur = conn.cursor()
    role = "applicant"
    account_id = None
    try:
        cur.execute(_RESET_TABLE_SQL)

        # Without a matching code nothing is changed.
        if not _valid_reset_code(cur, email, otp):
            raise HTTPException(status_code=400, detail="Invalid or expired reset code.")

        hashed_password = hash_password(new_password)

        # ---------------- Applicant ----------------
        cur.execute("SELECT id FROM applicants WHERE email = ?", (email,))
        applicant_row = cur.fetchone()

        if applicant_row:
            cur.execute("""
                UPDATE applicants
                SET password = ?
                WHERE email = ?
            """, (hashed_password, email))
            role = "applicant"
            account_id = applicant_row[0]

        # ---------------- HR ----------------
        else:
            cur.execute("SELECT id FROM hr_users WHERE email = ?", (email,))
            hr_row = cur.fetchone()
            if not hr_row:
                raise HTTPException(status_code=400, detail="Invalid or expired reset code.")

            cur.execute("""
                UPDATE hr_users
                SET password_hash = ?
                WHERE email = ?
            """, (hashed_password, email))
            role = "hr"
            account_id = hr_row[0]

        # Single use: consume the code.
        cur.execute("DELETE FROM password_reset WHERE email = ?", (email,))
        conn.commit()
    except HTTPException:
        conn.close()
        raise
    except Exception:
        conn.close()
        logger.exception("Legacy password reset failed")
        raise _public_error("We could not reset your password right now. Please try again.")
    conn.close()

    # Sessions created with the old password must not survive the reset.
    if role == "hr" and account_id is not None:
        revoke_all_sessions_for("hr", hr_id=int(account_id))
    elif account_id is not None:
        revoke_all_sessions_for("applicant", applicant_id=str(account_id))

    return {"success": True}
    
#=================================================
# HR DASHBOARD
#=================================================  
@app.get("/hr/dashboard/{hr_id}")
def hr_dashboard(hr_id: int, sess: dict = Depends(get_current_hr)):
    hr_id = require_hr_ownership(hr_id, sess)

    conn = sqlite3.connect(DB_PATH, isolation_level=None)
    cur = conn.cursor()

    cur.execute("""
        SELECT COUNT(*)
        FROM hr_job_posts
        WHERE hr_id = ?
        AND status='Open'
    """,(hr_id,))
    active_jobs = cur.fetchone()[0]

    cur.execute("""
        SELECT COUNT(*)
        FROM applications app
        JOIN hr_job_posts j
            ON app.job_id = j.id
        WHERE j.hr_id = ?
        AND j.status = 'Open'
    """, (hr_id,))
    applicants = cur.fetchone()[0]

    cur.execute("""
        SELECT COUNT(*)
        FROM applications app
        JOIN hr_job_posts j
            ON app.job_id = j.id
        WHERE j.hr_id = ?
        AND j.status = 'Open'
        AND app.interview_status = 'Completed'
    """, (hr_id,))
    completed = cur.fetchone()[0]

    cur.execute("""
        SELECT COUNT(*)
        FROM applications app
        JOIN hr_job_posts j
            ON app.job_id = j.id
        WHERE j.hr_id = ?
        AND j.status = 'Open'
        AND app.interview_status = 'In Progress'
    """, (hr_id,))
    pending = cur.fetchone()[0]

    cur.execute("""
        SELECT
            j.job_title,
            COUNT(app.id)
        FROM hr_job_posts j
        LEFT JOIN applications app
            ON app.job_id = j.id
        WHERE j.hr_id = ?
        AND j.status = 'Open'
        GROUP BY j.id
        ORDER BY j.created_at DESC
    """, (hr_id,))

    jobs = []

    for title,count in cur.fetchall():
        jobs.append({
            "job_title":title,
            "applicants":count
        })

    # =================================================
    # RECENT ACTIVITY
    # =================================================

    activities = []

    cur.execute("""
    SELECT
        a.full_name,
        j.job_title,
        app.applied_at
    FROM applications app
    JOIN applicants a
        ON app.applicant_id = a.id
    JOIN hr_job_posts j
        ON app.job_id = j.id
    WHERE j.hr_id = ?
    ORDER BY app.applied_at DESC
    LIMIT 5
    """, (hr_id,))

    for name, job, applied_at in cur.fetchall():
        activities.append(
            f"👤 {name} applied for {job}"
        )

    # =================================================
    # ACTION REQUIRED
    # =================================================

    cur.execute("""
    SELECT COUNT(*)
    FROM applications app
    JOIN hr_job_posts j
        ON app.job_id = j.id
    WHERE j.hr_id = ?
    AND app.interview_status = 'In Progress'
    """, (hr_id,))
    pending_hr = cur.fetchone()[0]

    cur.execute("""
    SELECT COUNT(*)
    FROM applications app
    JOIN hr_job_posts j
    ON app.job_id = j.id
    WHERE j.hr_id = ?
    AND j.status = 'Open'
    AND app.reissue_requested = 1
    """, (hr_id,))

    reissues = cur.fetchone()[0]

    cur.execute("""
    SELECT COUNT(*)
    FROM applications app
    JOIN hr_job_posts j
    ON app.job_id = j.id
    WHERE j.hr_id = ?
    AND app.interview_status = 'Abandoned'
    """, (hr_id,))
    expired = cur.fetchone()[0]

    # =================================================
    # MONTHLY HIRING GROWTH
    # =================================================

    from collections import OrderedDict
    from dateutil.relativedelta import relativedelta

    # Last 6 months initialized to 0
    today = datetime.utcnow()

    growth_dict = OrderedDict()

    for i in range(5, -1, -1):
        d = today - relativedelta(months=i)

        key = d.strftime("%Y-%m")

        growth_dict[key] = {
            "month": d.strftime("%b"),
            "applications": 0
        }

    # Fetch actual counts
    cur.execute("""
    SELECT
        strftime('%Y-%m', app.applied_at),
        COUNT(*)
    FROM applications app
    JOIN hr_job_posts j
    ON app.job_id = j.id
    WHERE j.hr_id = ?
    AND j.status = 'Open'
    GROUP BY strftime('%Y-%m', app.applied_at)
    """, (hr_id,))

    for month, count in cur.fetchall():
        if month in growth_dict:
            growth_dict[month]["applications"] = count

    growth = list(growth_dict.values())

    #=================================================
    # CLEANUP ABANDONED INTERVIEWS
    #================================================

    import time

    if not hasattr(hr_dashboard, "last_cleanup"):
        hr_dashboard.last_cleanup = 0

    # Expire abandoned interviews of this HR's own applications in place.
    # (Previously this was an unauthenticated self-HTTP call to
    # /interview/cleanup-abandoned, which no longer accepts anonymous callers.)
    if time.time() - hr_dashboard.last_cleanup > 60:
        try:
            stale_before = (datetime.utcnow() - timedelta(minutes=2)).isoformat()
            cleanup_conn = sqlite3.connect(DB_PATH, isolation_level=None)
            cleanup_cur = cleanup_conn.cursor()
            cleanup_cur.execute("""
                UPDATE applications
                SET interview_status = 'Abandoned'
                WHERE interview_status = 'In Progress'
                AND (last_seen IS NULL OR last_seen < ?)
                AND id IN (
                    SELECT app.id FROM applications app
                    JOIN hr_job_posts j ON app.job_id = j.id
                    WHERE j.hr_id = ?
                )
            """, (stale_before, hr_id))
            cleanup_conn.commit()
            cleanup_conn.close()
        except Exception:
            logger.exception("Abandoned-interview cleanup failed for hr_id=%s", hr_id)
        hr_dashboard.last_cleanup = time.time()

    return {
        "active_jobs": active_jobs,
        "total_applicants": applicants,
        "completed_interviews": completed,
        "pending_interviews": pending,
        "jobs": jobs,

        "activities": activities,

        "pending_hr": pending_hr,
        "reissues": reissues,
        "expired": expired,

        "top_jobs": jobs,
        "growth": growth
    }

# =================================================
# HR DASHBOARD ANALYTICS (NEW)
# =================================================
@app.get("/hr/dashboard/analytics/{hr_id}")
def hr_dashboard_analytics(hr_id: int, sess: dict = Depends(get_current_hr)):
    """Returns analytics data for the HR dashboard."""
    hr_id = require_hr_ownership(hr_id, sess)
    conn = sqlite3.connect(DB_PATH, isolation_level=None)
    cur = conn.cursor()

    # =================================================
    # 1. TOP APPLIED DOMAINS
    # =================================================
    cur.execute("""
        SELECT j.job_domain, COUNT(app.id) as total
        FROM applications app
        JOIN hr_job_posts j ON app.job_id = j.id
        WHERE j.hr_id = ? AND j.status = 'Open'
        AND j.job_domain IS NOT NULL AND j.job_domain != ''
        GROUP BY j.job_domain
        ORDER BY total DESC
        LIMIT 5
    """, (hr_id,))
    top_domains = [{"domain": row[0], "applications": row[1]} for row in cur.fetchall()]

    # =================================================
    # 2. TOP 5 JOB TITLES BY APPLICATIONS
    # =================================================
    cur.execute("""
        SELECT j.job_title, COUNT(app.id) as total
        FROM hr_job_posts j
        LEFT JOIN applications app ON app.job_id = j.id
        WHERE j.hr_id = ? AND j.status = 'Open'
        AND j.job_title IS NOT NULL AND j.job_title != ''
        GROUP BY j.id, j.job_title
        ORDER BY total DESC
        LIMIT 5
    """, (hr_id,))
    top_job_titles = [{"title": row[0], "applications": row[1]} for row in cur.fetchall()]

    # =================================================
    # 3. TOP 3 CANDIDATES BY INTERVIEW SCORE
    # =================================================
    cur.execute("""
        SELECT
            app.id,
            a.full_name,
            j.job_title,
            ir.analysis_json
        FROM interview_reports ir
        JOIN applications app ON ir.application_id = app.id
        JOIN applicants a ON app.applicant_id = a.id
        JOIN hr_job_posts j ON app.job_id = j.id
        WHERE j.hr_id = ?
        ORDER BY ir.created_at DESC
    """, (hr_id,))

    candidate_scores = []
    for row in cur.fetchall():
        application_id, full_name, job_title, analysis_json = row
        try:
            analysis = json.loads(analysis_json)
            total = 0
            count = 0
            for round_data in analysis.values():
                for item in round_data:
                    total += float(item.get("score", 0) or 0) * 10
                    count += 1
            overall_score = int(total / count) if count else 0
            candidate_scores.append({
                "application_id": application_id,
                "full_name": full_name,
                "job_title": job_title,
                "overall_score": overall_score
            })
        except (json.JSONDecodeError, ValueError, TypeError):
            continue

    # Sort descending by score, take top 3
    candidate_scores.sort(key=lambda x: x["overall_score"], reverse=True)
    top_candidates = candidate_scores[:3]

    # =================================================
    # 4. HIRING INSIGHTS
    # =================================================
    insights = {}

    # Most applied domain
    if top_domains:
        insights["most_applied_domain"] = top_domains[0]["domain"]

    # Total completed interviews
    cur.execute("""
        SELECT COUNT(*)
        FROM applications app
        JOIN hr_job_posts j ON app.job_id = j.id
        WHERE j.hr_id = ? AND app.interview_status = 'Completed'
    """, (hr_id,))
    insights["total_completed_interviews"] = cur.fetchone()[0]

    # Average interview score
    if candidate_scores:
        avg_score = sum(c["overall_score"] for c in candidate_scores) // len(candidate_scores)
        insights["average_interview_score"] = avg_score

    # Resume approval percentage
    cur.execute("""
        SELECT COUNT(*)
        FROM applications app
        JOIN hr_job_posts j ON app.job_id = j.id
        LEFT JOIN resume_reports rr ON rr.application_id = app.id
        WHERE j.hr_id = ? AND j.status = 'Open'
    """, (hr_id,))
    total_apps_with_resume = cur.fetchone()[0]

    cur.execute("""
        SELECT COUNT(*)
        FROM applications app
        JOIN hr_job_posts j ON app.job_id = j.id
        JOIN resume_reports rr ON rr.application_id = app.id
        WHERE j.hr_id = ? AND j.status = 'Open' AND rr.matched = 1
    """, (hr_id,))
    matched_resumes = cur.fetchone()[0]

    if total_apps_with_resume > 0:
        insights["resume_approval_percentage"] = round((matched_resumes / total_apps_with_resume) * 100)

    # Total applicants
    cur.execute("""
        SELECT COUNT(*)
        FROM applications app
        JOIN hr_job_posts j ON app.job_id = j.id
        WHERE j.hr_id = ? AND j.status = 'Open'
    """, (hr_id,))
    insights["total_applicants"] = cur.fetchone()[0]

    # =================================================
    # 5. PENDING ACTIONS
    # =================================================
    # Pending applicant approvals (status = 'pending')
    cur.execute("""
        SELECT COUNT(*)
        FROM applications app
        JOIN hr_job_posts j ON app.job_id = j.id
        WHERE j.hr_id = ? AND j.status = 'Open' AND app.status = 'pending'
    """, (hr_id,))
    pending_approvals = cur.fetchone()[0]

    # Pending interview code generation (approved but no interview_code)
    cur.execute("""
        SELECT COUNT(*)
        FROM applications app
        JOIN hr_job_posts j ON app.job_id = j.id
        WHERE j.hr_id = ? AND j.status = 'Open'
        AND app.status = 'approved'
        AND (app.interview_code IS NULL OR app.interview_code = '')
    """, (hr_id,))
    pending_codes = cur.fetchone()[0]

    # Pending reissue requests
    cur.execute("""
        SELECT COUNT(*)
        FROM applications app
        JOIN hr_job_posts j ON app.job_id = j.id
        WHERE j.hr_id = ? AND j.status = 'Open' AND app.reissue_requested = 1
    """, (hr_id,))
    pending_reissues = cur.fetchone()[0]

    conn.close()

    return {
        "top_domains": top_domains,
        "top_job_titles": top_job_titles,
        "top_candidates": top_candidates,
        "insights": insights,
        "pending_actions": {
            "pending_approvals": pending_approvals,
            "pending_codes": pending_codes,
            "pending_reissues": pending_reissues
        }
    }