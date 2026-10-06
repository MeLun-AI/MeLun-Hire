from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse
import sqlite3
import os
import json
import re
from datetime import datetime, timedelta
from auth.sessions import get_current_hr, require_hr_ownership

router = APIRouter(prefix="/hr", tags=["HR Applicants"])

from config.paths import DB_PATH, RESUME_DIR


def _resume_filename(applicant_id: str):
    """Return the stored resume filename for an applicant (or None).

    Reads the analysis.json your existing upload flow writes next to the
    uploaded file. The resume file itself is stored under the applicant's
    own folder keyed by applicant_id, so the application is linked to the
    resume through the applicant without duplicating the file.

    Prefers the original ``filename`` (falling back to ``stored_name``) and
    only reports a resume when its stored file actually exists on disk.
    """
    safe_id = re.sub(r"[^A-Za-z0-9_-]", "", applicant_id or "")
    if not safe_id:
        return None
    analysis_path = os.path.join(RESUME_DIR, safe_id, "analysis.json")
    if not os.path.exists(analysis_path):
        return None
    try:
        with open(analysis_path, "r", encoding="utf-8") as f:
            record = json.load(f) or {}
    except Exception:
        return None

    stored = record.get("stored_name")
    if stored and not os.path.exists(os.path.join(RESUME_DIR, safe_id, stored)):
        return None

    return record.get("filename") or stored


# =================================================
# SAFE SQLITE CONNECTION
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


# Match outcomes recorded on the application at apply time. A row created
# before this feature (or one whose evaluation could not run) has no stored
# status; those are resolved from the stored AI report and, failing that, stay
# in the matched bucket so pre-existing applicants never disappear.
MATCH_STATUS_MATCHED = "matched"
MATCH_STATUS_UNMATCHED = "unmatched"


def _resolve_match_status(stored_status, report_matched):
    """Return the authoritative match status for one application row."""
    value = (stored_status or "").strip().lower()
    if value in (MATCH_STATUS_MATCHED, MATCH_STATUS_UNMATCHED):
        return value
    if report_matched == 1:
        return MATCH_STATUS_MATCHED
    if report_matched == 0:
        return MATCH_STATUS_UNMATCHED
    return MATCH_STATUS_MATCHED


# =================================================
# LIST APPLICATIONS (HR VIEW)
# =================================================
@router.get("/applicants/{hr_id}")
def list_applicants(hr_id: str, sess: dict = Depends(get_current_hr)):
    hr_id = str(require_hr_ownership(hr_id, sess))
    conn = get_conn()
    cur = conn.cursor()

    # Mark interviews abandoned when the applicant has not sent
    # a heartbeat for more than 2 minutes.
    timeout = (datetime.utcnow() - timedelta(minutes=2)).isoformat()

    cur.execute("""
        UPDATE applications
        SET interview_status = 'Abandoned'
        WHERE interview_status = 'In Progress'
        AND (last_seen IS NULL OR last_seen < ?)
    """, (timeout,))

    conn.commit()

    cur.execute("""
        SELECT
            app.id AS application_id,
            a.id AS applicant_id,
            a.full_name,
            a.email,
            j.job_title,
            j.job_domain,
            app.status,
            app.applied_at,
            app.interview_code,
            app.interview_status,
            app.interview_expires_at,
            app.reissue_requested,
            app.reissue_count,
            app.code_email_sent,
            app.interview_code_send_method,
            app.match_status,
            app.match_score,
            app.match_missing_skills,
            (
                SELECT rr.matched FROM resume_reports rr
                WHERE rr.application_id = app.id
                ORDER BY rr.id DESC LIMIT 1
            ) AS report_matched,
            -- FINAL post-interview decision, added LAST so every column index
            -- used by the payload below stays exactly the same.
            app.final_decision,
            app.final_decision_source,
            app.final_decision_score
        FROM applications app
        JOIN applicants a ON app.applicant_id = a.id
        JOIN hr_job_posts j ON app.job_id = j.id
        WHERE j.hr_id = ?
        ORDER BY app.applied_at DESC
    """, (hr_id,))

    rows = cur.fetchall()
    conn.close()

    return [
        {
            "application_id": r[0],
            "applicant_id": r[1],
            "full_name": r[2],
            "email": r[3],
            "job_title": r[4],
            "job_domain": r[5],
            "status": r[6],
            "applied_at": r[7],
            "interview_code": r[8],
            "interview_status": r[9],
            "interview_expires_at": r[10],
            "reissue_requested": r[11],
            "reissue_count": r[12],
            "code_email_sent": r[13],
            # How the delivered code went out: 'automatic' (sent by the backend
            # when a newly matched candidate applied with the switch on) or
            # 'manual' (HR clicked Send Interview Code). NULL / '' means no code
            # has been delivered for this application yet.
            "code_send_method": r[14] or None,
            # Authoritative match status of THIS candidate's attempt for THIS
            # job, used by the HR Matched / Unmatched tabs.
            "match_status": _resolve_match_status(r[15], r[18]),
            "match_score": r[16],
            "match_missing_skills": r[17] or "",
            "resume_filename": _resume_filename(r[1]),
            # FINAL post-interview decision ('selected' | 'rejected') and how it
            # was made: 'manual' (this HR decided) or 'automatic' (the
            # automatic-decision switch). NULL = not decided yet.
            "final_decision": r[19] or None,
            "final_decision_source": r[20] or None,
            "final_decision_score": r[21],
        }
        for r in rows
    ]


# =================================================
# VIEW APPLICANT RESUME (HR VIEW)
# Serves the applicant's already-uploaded resume file.
# Authorization: the applicant must have applied to a job
# owned by this HR so a recruiter can only see resumes of
# applicants on their own job postings.
# =================================================
@router.get("/applicant-resume/{hr_id}/{applicant_id}")
def get_applicant_resume(hr_id: str, applicant_id: str, preview: bool = False, sess: dict = Depends(get_current_hr)):
    require_hr_ownership(hr_id, sess)
    safe_id = re.sub(r"[^A-Za-z0-9_-]", "", applicant_id or "")
    if not safe_id:
        raise HTTPException(status_code=404, detail="Applicant not found")

    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT COUNT(*)
        FROM applications app
        JOIN hr_job_posts j ON app.job_id = j.id
        WHERE app.applicant_id = ? AND j.hr_id = ?
    """, (applicant_id, str(hr_id)))
    row = cur.fetchone()
    conn.close()

    if not row or row[0] == 0:
        raise HTTPException(
            status_code=404,
            detail="No resume found for this applicant on your job posts.",
        )

    analysis_path = os.path.join(RESUME_DIR, safe_id, "analysis.json")
    if not os.path.exists(analysis_path):
        raise HTTPException(status_code=404, detail="Applicant has not uploaded a resume.")

    try:
        with open(analysis_path, "r", encoding="utf-8") as f:
            record = json.load(f) or {}
    except Exception:
        record = {}

    stored_name = record.get("stored_name")
    if not stored_name:
        raise HTTPException(status_code=404, detail="Applicant has not uploaded a resume.")

    file_path = os.path.join(RESUME_DIR, safe_id, stored_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Resume file is missing.")

    filename = record.get("filename") or stored_name
    ext = os.path.splitext(filename)[1].lower()
    media_type = {
        ".pdf": "application/pdf",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".doc": "application/msword",
        ".txt": "text/plain",
    }.get(ext, "application/octet-stream")

    # preview=1 -> serve inline (so PDFs render in the browser modal);
    # otherwise attach (for the explicit Download Resume button).
    disposition = "inline" if preview else "attachment"
    safe_name = (filename or "resume").replace('"', "")
    return FileResponse(
        path=file_path,
        media_type=media_type,
        headers={"Content-Disposition": f'{disposition}; filename="{safe_name}"'},
    )
