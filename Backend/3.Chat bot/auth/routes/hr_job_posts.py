from fastapi import APIRouter, Body, Depends, HTTPException
import re
import sqlite3
import os

# Import notification helper
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from routes.hr_notifications import create_notification
from auth.sessions import current_hr_id, get_current_hr, require_hr_ownership

router = APIRouter(prefix="/hr", tags=["HR Job Posts"])

from config.paths import DB_PATH


# =================================================
# DB CONNECTION HELPER (SAFE SQLITE)
# =================================================
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
# SAFE MIGRATION FOR EXTRA JOB FIELDS
# =================================================
def ensure_job_columns():
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("PRAGMA table_info(hr_job_posts)")
    columns = [col[1] for col in cur.fetchall()]

    required_columns = {
        "salary": "TEXT",
        "deadline": "TEXT",
        "required_skills": "TEXT",
        "preferred_skills": "TEXT",
        "responsibilities": "TEXT",
        "company_overview": "TEXT",
        "benefits": "TEXT",
        "hiring_process": "TEXT",
        "recruiter_notes": "TEXT",
    }

    for column, definition in required_columns.items():
        if column not in columns:
            cur.execute(f"ALTER TABLE hr_job_posts ADD COLUMN {column} {definition}")

    conn.commit()
    conn.close()


def split_list(value):
    """Split a stored text list into a clean array (commas, newlines, semicolons)."""
    if not value:
        return []
    return [item.strip() for item in re.split(r"[,\n;]", str(value)) if item.strip()]


ensure_job_columns()

# =========================
# CREATE JOB POST
# =========================
@router.post("/job-post")
def create_job(payload: dict = Body(...), sess: dict = Depends(get_current_hr)):
    # Authorization: a job is always created for the authenticated HR, and a
    # different hr_id in the body is rejected instead of being trusted.
    hr_id = current_hr_id(sess)
    body_hr_id = payload.get("hr_id")
    if body_hr_id is not None and str(body_hr_id) != str(hr_id):
        raise HTTPException(status_code=403, detail="Not your resource.")

    if not (payload.get("job_title") or "").strip():
        raise HTTPException(status_code=400, detail="Job title is required.")

    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
        INSERT INTO hr_job_posts (
            hr_id,
            job_title,
            job_domain,
            job_type,
            job_mode,
            experience_required,
            location,
            description,
            status,
            salary,
            deadline,
            required_skills,
            preferred_skills,
            responsibilities,
            company_overview,
            benefits,
            hiring_process,
            recruiter_notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        hr_id,
        payload["job_title"],
        payload.get("job_domain"),
        payload.get("job_type"),
        payload.get("job_mode"),
        payload.get("experience_required"),
        payload.get("location"),
        payload.get("description"),
        "Open",
        payload.get("salary"),
        payload.get("deadline"),
        payload.get("required_skills"),
        payload.get("preferred_skills"),
        payload.get("responsibilities"),
        payload.get("company_overview"),
        payload.get("benefits"),
        payload.get("hiring_process"),
        payload.get("recruiter_notes")
    ))

    conn.commit()
    conn.close()

    # Create notification for job created
    create_notification(
        hr_id=hr_id,
        application_id=None,
        type="job",
        title="New Job Created",
        message=f"New job posted: {payload['job_title']}"
    )

    return {"success": True}

# =========================
# LIST JOB POSTS (HR ONLY)
# =========================
@router.get("/job-posts/{hr_id}")
def list_jobs(hr_id: str, sess: dict = Depends(get_current_hr)):
    # Authorization: an HR may only list their own job posts.
    hr_id = str(require_hr_ownership(hr_id, sess))
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            id,
            job_title,
            job_domain,
            job_type,
            job_mode,
            location,
            status,
            created_at
        FROM hr_job_posts
        WHERE hr_id = ?
        ORDER BY created_at DESC
    """, (hr_id,))

    rows = cur.fetchall()
    conn.close()

    return [
        {
            "id": r[0],
            "job_title": r[1],
            "job_domain": r[2],
            "job_type": r[3],
            "job_mode": r[4],
            "location": r[5],
            "status": r[6],
            "created_at": r[7],
        }
        for r in rows
    ]


# =========================
# CLOSE JOB POST
# =========================
def _close_job_row(job_id, hr_id: int) -> str:
    """Close ONE job post owned by ``hr_id``.

    Shared by the single-record endpoint and the bulk endpoint. Returns
    'closed' when the post was updated, 'already_closed' when it was already
    closed, or 'not_found' when it does not exist or belongs to another HR
    (the caller then decides between a 404 and a skipped row).
    """
    conn = get_conn()
    cur = conn.cursor()

    # Authorization: a job post can only be closed by the HR that owns it.
    cur.execute("SELECT hr_id, status FROM hr_job_posts WHERE id = ?", (job_id,))
    row = cur.fetchone()
    if not row or int(row[0]) != hr_id:
        conn.close()
        return "not_found"

    if str(row[1] or "").lower() == "closed":
        conn.close()
        return "already_closed"

    cur.execute("""
        UPDATE hr_job_posts
        SET status = 'Closed'
        WHERE id = ? AND hr_id = ?
    """, (job_id, hr_id))

    conn.commit()
    conn.close()
    return "closed"


@router.post("/job-post/{job_id}/close")
def close_job(job_id: int, sess: dict = Depends(get_current_hr)):
    # Authorization: a job post can only be closed by the HR that owns it.
    hr_id = current_hr_id(sess)

    outcome = _close_job_row(job_id, hr_id)
    if outcome == "not_found":
        raise HTTPException(status_code=404, detail="Job not found.")

    # Create notification for job closed
    if hr_id and outcome == "closed":
        create_notification(
            hr_id=hr_id,
            application_id=None,
            type="job",
            title="Job Post Closed",
            message=f"Job posting has been closed."
        )

    return {"success": True, "message": "Job closed successfully"}


# =========================
# CLOSE SEVERAL JOB POSTS
# =========================
@router.post("/job-posts/bulk-close")
def close_jobs_bulk(payload: dict = Body(...), sess: dict = Depends(get_current_hr)):
    """Close SEVERAL job posts of the authenticated HR in one request.

    Each id goes through the same ownership check as the single-close endpoint,
    so another company's job post is reported as skipped instead of being
    modified. One summary notification is created for the whole action to avoid
    flooding the HR feed with identical entries.
    """
    hr_id = current_hr_id(sess)

    raw_ids = payload.get("job_ids") or []
    if not isinstance(raw_ids, list) or not raw_ids:
        raise HTTPException(status_code=400, detail="Missing job_ids")

    # De-duplicate while keeping the caller's order.
    unique_ids = []
    for value in raw_ids:
        try:
            job_id = int(value)
        except (TypeError, ValueError):
            continue
        if job_id not in unique_ids:
            unique_ids.append(job_id)

    if not unique_ids:
        raise HTTPException(status_code=400, detail="Missing job_ids")

    closed = []
    skipped = []
    for job_id in unique_ids:
        outcome = _close_job_row(job_id, hr_id)
        if outcome in ("closed", "already_closed"):
            closed.append(job_id)
        else:
            skipped.append(job_id)

    if closed:
        create_notification(
            hr_id=hr_id,
            application_id=None,
            type="job",
            title="Job Posts Closed",
            message=f"{len(closed)} job posting(s) have been closed.",
        )

    return {
        "success": True,
        "message": "Job posts closed successfully",
        "closed": closed,
        "skipped": skipped,
    }


# ===========================================
# LIST OPEN JOB POSTS (FOR APPLICANTS)
# ===========================================
@router.get("/jobs")
def get_open_jobs():
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            j.id,
            j.job_title,
            j.job_domain,
            j.job_type,
            j.job_mode,
            j.experience_required,
            j.location,
            j.description,
            j.status,
            j.created_at,
            j.salary,
            j.deadline,
            j.required_skills,
            j.preferred_skills,
            j.responsibilities,
            j.company_overview,
            j.benefits,
            j.hiring_process,
            j.recruiter_notes,
            u.company_name,
            (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id) AS applicants_count
        FROM hr_job_posts j
        JOIN hr_users u ON j.hr_id = u.id
        WHERE j.status = 'Open'
        ORDER BY j.created_at DESC
    """)

    rows = cur.fetchall()
    conn.close()

    return [
        {
            "id": row[0],
            "job_title": row[1],
            "job_domain": row[2],
            "job_type": row[3],
            "job_mode": row[4],
            "experience_required": row[5],
            "location": row[6],
            "description": row[7],
            "status": row[8],
            "created_at": row[9],
            "salary": row[10],
            "deadline": row[11],
            "required_skills": split_list(row[12]),
            "preferred_skills": split_list(row[13]),
            "responsibilities": split_list(row[14]),
            "company_overview": row[15],
            "benefits": split_list(row[16]),
            "hiring_process": split_list(row[17]),
            "recruiter_notes": row[18],
            "company_name": row[19],
            "applicants_count": row[20] or 0,
        }
        for row in rows
    ]

