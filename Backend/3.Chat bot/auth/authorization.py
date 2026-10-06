"""Database-derived authorization helpers.

Every check here answers a question of the form "does the *authenticated*
principal actually own this resource?", using the existing database
relationships:

    application -> hr_job_posts.hr_id            (HR side)
    application -> applications.applicant_id     (applicant side)

Client-supplied ids are inputs to these lookups only - they are never trusted
as proof of authorization. When a lookup fails we raise 404 (not 403) so the
existence of other tenants' records is not disclosed.
"""
import sqlite3
from typing import Optional

from fastapi import HTTPException

from config.paths import DB_PATH


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30, check_same_thread=False, isolation_level=None)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA busy_timeout=30000;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    return conn


def _not_found(detail: str) -> HTTPException:
    return HTTPException(status_code=404, detail=detail)


# ---------------------------------------------------------------
# APPLICATIONS
# ---------------------------------------------------------------
def application_owner(application_id) -> Optional[str]:
    """Applicant id that owns an application (None when it does not exist)."""
    try:
        app_id = int(application_id)
    except (TypeError, ValueError):
        return None
    conn = get_conn()
    try:
        row = conn.execute(
            "SELECT applicant_id FROM applications WHERE id = ?", (app_id,)
        ).fetchone()
    finally:
        conn.close()
    return str(row[0]) if row else None


def applicant_owns_application(applicant_id: str, application_id) -> bool:
    owner = application_owner(application_id)
    return bool(owner) and owner == str(applicant_id)


def require_applicant_owns_application(
    applicant_id: str, application_id, detail: str = "Application not found."
) -> None:
    if not applicant_owns_application(applicant_id, application_id):
        raise _not_found(detail)


def hr_owns_application(hr_id: int, application_id) -> bool:
    """True when the application belongs to a job posted by this HR."""
    try:
        app_id = int(application_id)
    except (TypeError, ValueError):
        return False
    conn = get_conn()
    try:
        row = conn.execute(
            "SELECT j.hr_id FROM applications app "
            "JOIN hr_job_posts j ON app.job_id = j.id "
            "WHERE app.id = ?",
            (app_id,),
        ).fetchone()
    finally:
        conn.close()
    return bool(row) and int(row[0]) == int(hr_id)


def require_hr_owns_application(
    hr_id: int, application_id, detail: str = "Not found."
) -> None:
    if not hr_owns_application(hr_id, application_id):
        raise _not_found(detail)


# ---------------------------------------------------------------
# APPLICANTS / RESUMES
# ---------------------------------------------------------------
def hr_owns_applicant(hr_id: int, applicant_id: str) -> bool:
    """True when the applicant applied to at least one of this HR's jobs."""
    if not applicant_id:
        return False
    conn = get_conn()
    try:
        row = conn.execute(
            "SELECT COUNT(*) FROM applications app "
            "JOIN hr_job_posts j ON app.job_id = j.id "
            "WHERE app.applicant_id = ? AND j.hr_id = ?",
            (str(applicant_id), int(hr_id)),
        ).fetchone()
    finally:
        conn.close()
    return bool(row) and int(row[0]) > 0


def require_hr_owns_applicant(
    hr_id: int, applicant_id: str, detail: str = "Candidate not found."
) -> None:
    if not hr_owns_applicant(hr_id, applicant_id):
        raise _not_found(detail)


# ---------------------------------------------------------------
# JOBS
# ---------------------------------------------------------------
def hr_owns_job(hr_id: int, job_id) -> bool:
    try:
        jid = int(job_id)
    except (TypeError, ValueError):
        return False
    conn = get_conn()
    try:
        row = conn.execute("SELECT hr_id FROM hr_job_posts WHERE id = ?", (jid,)).fetchone()
    finally:
        conn.close()
    return bool(row) and int(row[0]) == int(hr_id)


def require_hr_owns_job(hr_id: int, job_id, detail: str = "Job not found.") -> None:
    if not hr_owns_job(hr_id, job_id):
        raise _not_found(detail)


# ---------------------------------------------------------------
# NOTIFICATIONS
# ---------------------------------------------------------------
def hr_owns_notification(hr_id: int, notification_id) -> bool:
    try:
        nid = int(notification_id)
    except (TypeError, ValueError):
        return False
    conn = get_conn()
    try:
        row = conn.execute(
            "SELECT hr_id FROM notifications WHERE id = ?", (nid,)
        ).fetchone()
    finally:
        conn.close()
    return bool(row) and row[0] is not None and int(row[0]) == int(hr_id)


def applicant_owns_notification(applicant_id: str, notification_id) -> bool:
    try:
        nid = int(notification_id)
    except (TypeError, ValueError):
        return False
    conn = get_conn()
    try:
        row = conn.execute(
            "SELECT applicant_id FROM notifications WHERE id = ?", (nid,)
        ).fetchone()
    finally:
        conn.close()
    return bool(row) and row[0] is not None and str(row[0]) == str(applicant_id)
