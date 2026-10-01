"""Applicant self-service account deletion (own account only)."""

import logging
import os
import re
import shutil
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel

from auth.sessions import (
    clear_session_cookie,
    current_applicant_id,
    get_current_applicant,
    revoke_all_sessions_for,
)
from utils.rate_limit import check_rate_limit
from utils.security import password_matches

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/applicant", tags=["Applicant Settings"])

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DB_PATH = os.path.join(BASE_DIR, "database", "database.db")
RESUME_DIR = os.path.join(BASE_DIR, "data", "resumes")
PROFILE_IMG_DIR = os.path.join(BASE_DIR, "data", "profile_images")

DELETE_CONFIRMATION = "DELETE"


class DeleteAccountRequest(BaseModel):
    password: str = ""
    confirmation: str = ""


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(
        DB_PATH, timeout=30, check_same_thread=False, isolation_level=None
    )
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA busy_timeout=30000;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    return conn


def _tables(conn: sqlite3.Connection) -> set:
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table'"
    ).fetchall()
    return {r[0] for r in rows}


def _cols(conn: sqlite3.Connection, table: str) -> set:
    try:
        return {r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    except Exception:
        return set()


def _has(conn: sqlite3.Connection, tables: set, table: str, col: str = "") -> bool:
    if table not in tables:
        return False
    if col and col not in _cols(conn, table):
        return False
    return True


@router.post("/delete-account")
def delete_own_account(
    payload: DeleteAccountRequest,
    response: Response,
    sess: dict = Depends(get_current_applicant),
):
    """Permanently delete the authenticated applicant's own account."""
    # Identity comes ONLY from the session; no user id is accepted from the
    # client, so one applicant can never delete another's account.
    applicant_id = current_applicant_id(sess)
    check_rate_limit(f"delete-account:{applicant_id}", 5, 3600)

    if not (payload.password or ""):
        raise HTTPException(status_code=400, detail="Please enter your password.")
    if (payload.confirmation or "").strip() != DELETE_CONFIRMATION:
        raise HTTPException(
            status_code=400,
            detail="Please type DELETE to confirm account deletion.",
        )

    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT email, password, profile_pic FROM applicants WHERE id = ?",
            (applicant_id,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Account not found.")
        email = (row[0] or "").strip().lower()
        if not password_matches(payload.password, row[1]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Your password is incorrect.",
            )
        profile_pic = row[2] if len(row) > 2 else None

        tables = _tables(conn)
        app_ids = []
        if "applications" in tables:
            app_ids = [
                r[0]
                for r in cur.execute(
                    "SELECT id FROM applications WHERE applicant_id = ?",
                    (applicant_id,),
                ).fetchall()
            ]

        def by_apps(table: str, col: str = "application_id") -> None:
            if app_ids and _has(conn, tables, table, col):
                holders = ",".join("?" for _ in app_ids)
                cur.execute(
                    f"DELETE FROM {table} WHERE {col} IN ({holders})",
                    tuple(app_ids),
                )

        def by_owner(table: str, col: str = "applicant_id") -> None:
            if _has(conn, tables, table, col):
                cur.execute(f"DELETE FROM {table} WHERE {col} = ?", (applicant_id,))

        # Per-application children scoped to this applicant's applications.
        by_apps("resume_reports")
        by_apps("interview_reports")
        by_apps("proctoring_violations")
        by_apps("notifications")
        by_apps("ta_evaluations")
        by_apps("ta_challenge_requests")
        # Direct applicant-keyed rows (reports may also carry applicant_id).
        by_owner("interview_reports")
        by_owner("proctoring_violations")
        by_owner("notifications")
        by_owner("ta_evaluations")
        by_owner("ta_challenge_requests")
        by_owner("applications")
        by_owner("career_quest_attempts")
        by_owner("career_quest_skill_signals")
        by_owner("career_quest_mystery")
        if email:
            if "password_reset" in tables:
                cur.execute("DELETE FROM password_reset WHERE email = ?", (email,))
            if "password_reset_tokens" in tables:
                cur.execute(
                    "DELETE FROM password_reset_tokens WHERE email = ?", (email,)
                )

        # The account itself. HR/company tables (hr_users, hr_job_posts,
        # hr_company_profile, HR-aggregate Talent Arena tables) are never
        # touched, so other users and shared jobs survive.
        cur.execute("DELETE FROM applicants WHERE id = ?", (applicant_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Account not found.")
        conn.commit()
    except HTTPException:
        raise
    except Exception:
        logger.exception("Applicant account deletion failed")
        raise HTTPException(
            status_code=500,
            detail="Unable to delete your account. Please try again.",
        )
    finally:
        try:
            conn.close()
        except Exception:
            pass

    # Invalidate every session for this applicant and clear the caller cookie.
    try:
        revoke_all_sessions_for("applicant", applicant_id=applicant_id)
    except Exception:
        logger.exception("Failed revoking sessions after account deletion")
    clear_session_cookie(response)

    # Remove owned upload files (best effort, never fatal).
    try:
        safe_id = re.sub(r"[^A-Za-z0-9_-]", "", applicant_id or "")
        folder = os.path.join(RESUME_DIR, safe_id)
        if safe_id and os.path.isdir(folder):
            shutil.rmtree(folder, ignore_errors=True)
    except Exception:
        logger.exception("Failed removing resume folder after account deletion")
    try:
        if profile_pic:
            base = os.path.abspath(PROFILE_IMG_DIR)
            target = os.path.abspath(os.path.join(BASE_DIR, str(profile_pic)))
            if target.startswith(base + os.sep) and os.path.isfile(target):
                os.remove(target)
    except Exception:
        logger.exception("Failed removing profile image after account deletion")

    return {"success": True}
