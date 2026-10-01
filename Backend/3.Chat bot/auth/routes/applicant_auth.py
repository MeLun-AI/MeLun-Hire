from fastapi import APIRouter, HTTPException, Depends, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr
from datetime import datetime
import logging
import sqlite3
import os
import sys
import uuid
from utils.security import hash_password, password_matches
from utils.rate_limit import check_rate_limit, client_host, limit_login
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from routes.hr_notifications import create_notification
from auth.sessions import (
    clear_session_cookie,
    create_session,
    current_token,
    get_current_applicant,
    require_applicant_ownership,
    revoke_session,
    set_session_cookie,
)

logger = logging.getLogger(__name__)

# =================================================
# ROUTER
# =================================================
router = APIRouter(prefix="/applicant", tags=["Applicant Auth"])

# =================================================
# DATABASE
# =================================================
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DB_PATH = os.path.join(BASE_DIR, "database", "database.db")

def get_conn():
    conn = sqlite3.connect(
        DB_PATH,
        timeout=30,
        check_same_thread=False,
        isolation_level=None
    )
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA busy_timeout=30000;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    return conn

# =================================================
# SCHEMAS
# =================================================
class ApplicantSignupRequest(BaseModel):
    full_name: str
    email: EmailStr
    phone: str
    password: str
    location: str
    experience_years: int
    skills: str


class ApplicantLoginRequest(BaseModel):
    email: EmailStr
    password: str

# =================================================
# SIGNUP
# =================================================
@router.post("/signup")
def applicant_signup(data: ApplicantSignupRequest, request: Request):
    # Signup is rate limited per client host so accounts cannot be mass-created.
    check_rate_limit(f"signup-ip:{client_host(request)}", 10, 3600)

    email = str(data.email or "").strip().lower()

    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        cur.execute("SELECT id FROM applicants WHERE email = ?", (email,))
        if cur.fetchone():
            raise HTTPException(status_code=400, detail="Email already registered")

        applicant_id = f"CAND-{uuid.uuid4().hex[:6].upper()}"
        hashed_password = hash_password(data.password)

        cur.execute("""
            INSERT INTO applicants (
                id,
                full_name,
                email,
                phone,
                password,
                location,
                experience_years,
                skills,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            applicant_id,
            data.full_name,
            email,
            data.phone,
            hashed_password,
            data.location,
            data.experience_years,
            data.skills,
            datetime.utcnow()
        ))

        conn.commit()

        session = create_session(role="applicant", applicant_id=applicant_id)
        response = JSONResponse({
            "message": "Applicant signup successful",
            "applicant_id": applicant_id,
            "auth_token": session["auth_token"],
            "expires_at": session["expires_at"],
        })
        set_session_cookie(response, session["auth_token"])
        return response

    except HTTPException:
        raise
    except Exception:
        # Never leak internal errors to the client.
        logger.exception("Applicant signup failed")
        raise HTTPException(
            status_code=500,
            detail="We could not create your account right now. Please try again.",
        )
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass

# =================================================
# LOGIN
# =================================================
@router.post("/logout")
def applicant_logout(request: Request, response: Response):
    """Revoke the caller's session and clear the HttpOnly session cookie."""
    raw = current_token(request)
    if raw:
        revoke_session(raw)
    clear_session_cookie(response)
    return {"success": True}


@router.post("/login")
def applicant_login(data: ApplicantLoginRequest, request: Request):
    email = str(data.email or "").strip().lower()

    # Brute-force protection (per account and per client host).
    limit_login(email, request)

    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
        SELECT id, full_name, email, password
        FROM applicants
        WHERE email = ?
    """, (email,))

    row = cur.fetchone()
    conn.close()

    # One generic message for "no such account" and "wrong password".
    if not row or not password_matches(data.password, row[3]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    applicant_id, full_name, stored_email, _ = row

    session = create_session(role="applicant", applicant_id=applicant_id)
    response = JSONResponse({
        "applicant_id": applicant_id,
        "full_name": full_name,
        "email": stored_email,
        "auth_token": session["auth_token"],
        "expires_at": session["expires_at"],
    })
    set_session_cookie(response, session["auth_token"])
    return response

# =================================================
# MATCH OUTCOME (APPLY-TIME)
# =================================================
def _store_match_outcome(application_id, match_status, match_score, missing_skills):
    """Persist the apply-time match outcome on the application row itself.

    Stored on the application (not a parallel table) so the status always
    belongs to one candidate + one job, and the HR list can read it cheaply.
    """
    conn = None
    try:
        conn = get_conn()
        conn.execute(
            """
            UPDATE applications
            SET match_status = ?, match_score = ?, match_missing_skills = ?
            WHERE id = ?
            """,
            (match_status, match_score, ", ".join(missing_skills or []), application_id),
        )
        conn.commit()
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass


# =================================================
# APPLY TO JOB (CREATE APPLICATION)
# =================================================
@router.post("/apply")
def apply_to_job(payload: dict, sess: dict = Depends(get_current_applicant)):
    conn = None
    try:
        applicant_id = require_applicant_ownership(payload.get("applicant_id"), sess)
        job_id = payload.get("job_id")

        if not applicant_id or not job_id:
            raise HTTPException(
                status_code=400,
                detail="Missing applicant_id or job_id"
            )

        conn = get_conn()
        cur = conn.cursor()

        # Get hr_id, job title, and applicant name for notification
        cur.execute("SELECT hr_id, job_title FROM hr_job_posts WHERE id = ?", (job_id,))
        job_row = cur.fetchone()
        hr_id = job_row[0] if job_row else None
        job_title = job_row[1] if job_row else "a position"

        cur.execute("SELECT full_name FROM applicants WHERE id = ?", (applicant_id,))
        app_row = cur.fetchone()
        applicant_name = app_row[0] if app_row else "A candidate"

        cur.execute("""
            INSERT INTO applications (
                applicant_id,
                job_id,
                resume_status,
                applied_at
            )
            VALUES (?, ?, 'Pending', ?)
        """, (
            applicant_id,
            job_id,
            datetime.utcnow()
        ))

        application_db_id = cur.lastrowid

        conn.commit()

    except sqlite3.IntegrityError:
        raise HTTPException(
            status_code=400,
            detail="Already applied to this job"
        )

    except HTTPException:
        raise

    except Exception:
        logger.exception("Apply to job failed for applicant_id=%s", payload.get("applicant_id"))
        raise HTTPException(
            status_code=500,
            detail="We could not submit your application right now. Please try again.",
        )

    finally:
        # Always release the connection so a failed/duplicate apply never
        # leaves an open transaction that locks the database.
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass

    # Evaluate this attempt against THIS job using the existing evaluation
    # engine and record the outcome on the application, so an unmatched
    # attempt is recorded and visible to HR instead of disappearing.
    # Best effort: the application is already stored, so a failed evaluation
    # must never fail the apply.
    match_status = None
    match_score = None
    missing_skills: list = []
    try:
        from services.resume_evaluation import evaluate_application_match

        outcome = evaluate_application_match(DB_PATH, application_db_id)
        if outcome:
            match_status = "matched" if outcome["matched"] else "unmatched"
            match_score = outcome["match_score"]
            missing_skills = outcome.get("missing_skills") or []
            _store_match_outcome(
                application_db_id, match_status, match_score, missing_skills
            )
    except Exception:
        logger.exception(
            "Match evaluation failed for application_id=%s", application_db_id
        )

    # MATCHED attempts are eligible for an automatic interview code when the HR
    # has switched that on. Server-side and best effort: unmatched attempts are
    # never emailed (guarded again inside the service), duplicates are
    # prevented, and a delivery failure never affects the recorded application.
    if match_status == "matched":
        try:
            from services.auto_interview import maybe_auto_send_interview_code

            maybe_auto_send_interview_code(DB_PATH, application_db_id)
        except Exception:
            logger.exception(
                "Automatic interview code failed for application_id=%s",
                application_db_id,
            )

    # Create notification for new application
    if hr_id:
        create_notification(
            hr_id=hr_id,
            application_id=application_db_id,
            type="application",
            title="New Applicant",
            message=f"{applicant_name} applied for {job_title}"
        )

    return {
        "success": True,
        "match_status": match_status,
        "match_score": match_score,
        "missing_skills": missing_skills,
    }
