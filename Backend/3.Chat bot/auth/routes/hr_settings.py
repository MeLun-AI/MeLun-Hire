from fastapi import APIRouter, HTTPException, Body, Depends
from datetime import datetime
import sqlite3

from auth.sessions import (
    current_hr_id,
    get_current_hr,
    require_hr_ownership,
    revoke_all_sessions_for,
)

router = APIRouter(prefix="/hr", tags=["HR Settings"])

from config.paths import DB_PATH


def get_conn():
    conn = sqlite3.connect(DB_PATH, timeout=30, check_same_thread=False, isolation_level=None)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA busy_timeout=30000;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    return conn


def ensure_prefs_table():
    conn = get_conn()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS hr_notification_preferences (
            hr_id INTEGER PRIMARY KEY,
            new_applicant INTEGER DEFAULT 1,
            interview INTEGER DEFAULT 1,
            reissue INTEGER DEFAULT 1,
            job INTEGER DEFAULT 1
        )
    """)
    conn.commit()
    conn.close()


def ensure_is_active_column():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("PRAGMA table_info(hr_users)")
    columns = [col[1] for col in cur.fetchall()]
    if "is_active" not in columns:
        cur.execute("ALTER TABLE hr_users ADD COLUMN is_active INTEGER DEFAULT 1")
        conn.commit()
    conn.close()


ensure_prefs_table()
ensure_is_active_column()

# The automatic interview-code switch lives on the same per-HR preferences row.
# The shared interview-code service owns the column guard, so the apply-time
# automation (which can run before this router is imported) stays consistent.
from services.auto_interview import ensure_prefs_columns as _ensure_prefs_columns

_ensure_prefs_columns(DB_PATH)

# The automatic post-interview DECISION switch lives on the same preferences
# row. The shared decision service owns its column guard, so the interview
# submission path (which can run without this router ever being imported)
# always finds the column it needs.
from services.final_decision import ensure_decision_columns as _ensure_decision_columns

_ensure_decision_columns(DB_PATH)


# =================================================
# DEACTIVATE ACCOUNT (SAFE DEACTIVATION)
# =================================================
@router.post("/deactivate-account")
def deactivate_account(payload: dict = Body(...), sess: dict = Depends(get_current_hr)):
    # Authorization: an HR may only deactivate their own account. The id comes
    # from the session, and a mismatching body id is rejected.
    hr_id = current_hr_id(sess)
    body_hr_id = payload.get("hr_id")
    if body_hr_id is not None and str(body_hr_id) != str(hr_id):
        raise HTTPException(status_code=403, detail="Not your resource.")

    password = payload.get("password")

    if not password:
        raise HTTPException(status_code=400, detail="Missing required fields")


    conn = get_conn()
    cur = conn.cursor()

    # Verify HR exists and password is correct
    cur.execute("SELECT password_hash, is_active FROM hr_users WHERE id = ?", (hr_id,))
    row = cur.fetchone()

    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="HR user not found")

    from utils.security import password_matches

    if not password_matches(password, row[0]):
        conn.close()
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    if row[1] == 0:
        conn.close()
        raise HTTPException(status_code=400, detail="Account is already deactivated")

    # Set is_active = 0
    cur.execute("UPDATE hr_users SET is_active = 0 WHERE id = ?", (hr_id,))

    # Close all open job posts
    cur.execute("UPDATE hr_job_posts SET status = 'Closed' WHERE hr_id = ? AND status = 'Open'", (hr_id,))

    conn.commit()
    conn.close()

    # A deactivated account must not keep working sessions alive.
    revoke_all_sessions_for("hr", hr_id=hr_id)

    return {"success": True, "message": "Account deactivated successfully"}


# =================================================
# GET HR PROFILE
# =================================================
@router.get("/profile/{hr_id}")
def get_hr_profile(hr_id: int, sess: dict = Depends(get_current_hr)):
    hr_id = require_hr_ownership(hr_id, sess)
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
        SELECT id, hr_name, email, company_name, created_at
        FROM hr_users
        WHERE id = ?
    """, (hr_id,))

    row = cur.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="HR user not found")

    return {
        "hr_id": row[0],
        "hr_name": row[1],
        "email": row[2],
        "company_name": row[3],
        "member_since": row[4] or datetime.utcnow().isoformat(),
    }


# =================================================
# CHANGE PASSWORD
# =================================================
@router.post("/change-password")
def change_password(payload: dict = Body(...), sess: dict = Depends(get_current_hr)):
    # Authorization: only the authenticated HR can rotate their own password.
    hr_id = current_hr_id(sess)
    body_hr_id = payload.get("hr_id")
    if body_hr_id is not None and str(body_hr_id) != str(hr_id):
        raise HTTPException(status_code=403, detail="Not your resource.")

    current_password = payload.get("current_password")
    new_password = payload.get("new_password")

    if not current_password or not new_password:
        raise HTTPException(status_code=400, detail="Missing required fields")

    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    conn = get_conn()
    cur = conn.cursor()

    cur.execute("SELECT password_hash FROM hr_users WHERE id = ?", (hr_id,))
    row = cur.fetchone()

    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="HR user not found")

    from utils.security import password_matches, hash_password

    if not password_matches(current_password, row[0]):
        conn.close()
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    new_hash = hash_password(new_password)

    cur.execute("UPDATE hr_users SET password_hash = ? WHERE id = ?", (new_hash, hr_id))
    conn.commit()
    conn.close()

    return {"success": True, "message": "Password updated successfully"}


# =================================================
# GET NOTIFICATION PREFERENCES
# =================================================
@router.get("/notification-preferences/{hr_id}")
def get_notification_prefs(hr_id: int, sess: dict = Depends(get_current_hr)):
    hr_id = require_hr_ownership(hr_id, sess)
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT new_applicant, interview, reissue, job
        FROM hr_notification_preferences
        WHERE hr_id = ?
    """, (hr_id,))
    row = cur.fetchone()
    conn.close()
    if not row:
        return {"new_applicant": True, "interview": True, "reissue": True, "job": True}
    return {
        "new_applicant": bool(row[0]),
        "interview": bool(row[1]),
        "reissue": bool(row[2]),
        "job": bool(row[3]),
    }


# =================================================
# SAVE NOTIFICATION PREFERENCES
# =================================================
@router.post("/notification-preferences")
def save_notification_prefs(payload: dict = Body(...), sess: dict = Depends(get_current_hr)):
    # Authorization: preferences are always stored for the authenticated HR.
    hr_id = current_hr_id(sess)
    body_hr_id = payload.get("hr_id")
    if body_hr_id is not None and str(body_hr_id) != str(hr_id):
        raise HTTPException(status_code=403, detail="Not your resource.")

    new_applicant = 1 if payload.get("new_applicant", True) else 0
    interview = 1 if payload.get("interview", True) else 0
    reissue = 1 if payload.get("reissue", True) else 0
    job = 1 if payload.get("job", True) else 0

    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO hr_notification_preferences (hr_id, new_applicant, interview, reissue, job)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(hr_id) DO UPDATE SET
            new_applicant = excluded.new_applicant,
            interview = excluded.interview,
            reissue = excluded.reissue,
            job = excluded.job
    """, (hr_id, new_applicant, interview, reissue, job))
    conn.commit()
    conn.close()
    return {"success": True}


# =================================================
# AUTOMATIC INTERVIEW CODES (PER-HR SWITCH)
# =================================================
@router.get("/auto-interview-codes/{hr_id}")
def get_auto_interview_codes(hr_id: int, sess: dict = Depends(get_current_hr)):
    """Whether newly matched candidates are automatically sent a code.

    The setting is persisted per HR account (the same preferences row as the
    notification toggles), so it survives a page refresh, a new session and a
    re-login instead of living in frontend state.
    """
    hr_id = require_hr_ownership(hr_id, sess)
    from services.auto_interview import auto_interview_codes_enabled

    return {"auto_interview_codes": auto_interview_codes_enabled(DB_PATH, hr_id)}


# =================================================
# SAVE AUTOMATIC INTERVIEW CODES SWITCH
# =================================================
@router.post("/auto-interview-codes")
def save_auto_interview_codes(payload: dict = Body(...), sess: dict = Depends(get_current_hr)):
    # Authorization: the switch is always stored for the authenticated HR, so a
    # body hr_id can never enable/disable it for somebody else.
    hr_id = current_hr_id(sess)
    body_hr_id = payload.get("hr_id")
    if body_hr_id is not None and str(body_hr_id) != str(hr_id):
        raise HTTPException(status_code=403, detail="Not your resource.")

    enabled = bool(payload.get("enabled"))
    from services.auto_interview import set_auto_interview_codes

    stored = set_auto_interview_codes(DB_PATH, hr_id, enabled)
    return {"success": True, "auto_interview_codes": stored}


# =================================================
# AUTOMATIC CANDIDATE DECISIONS (PER-HR SWITCH)
# =================================================
@router.get("/auto-decide-candidates/{hr_id}")
def get_auto_decide_candidates(hr_id: int, sess: dict = Depends(get_current_hr)):
    """Whether a COMPLETED interview is decided automatically by the backend.

    ON  - a finished interview is selected (score >= 50%) or rejected after the
          interview is completed, from the same score the HR report shows;
    OFF - the recruiter decides manually (the default).

    The setting is persisted per HR account (the same preferences row as the
    notification toggles), so it survives a refresh, a new session and a
    re-login instead of living in frontend state.
    """
    hr_id = require_hr_ownership(hr_id, sess)
    from services.final_decision import auto_decide_enabled

    return {"auto_decide_candidates": auto_decide_enabled(DB_PATH, hr_id)}


# =================================================
# SAVE AUTOMATIC CANDIDATE DECISIONS SWITCH
# =================================================
@router.post("/auto-decide-candidates")
def save_auto_decide_candidates(payload: dict = Body(...), sess: dict = Depends(get_current_hr)):
    # Authorization: the switch is always stored for the authenticated HR, so a
    # body hr_id can never change it for somebody else.
    hr_id = current_hr_id(sess)
    body_hr_id = payload.get("hr_id")
    if body_hr_id is not None and str(body_hr_id) != str(hr_id):
        raise HTTPException(status_code=403, detail="Not your resource.")

    enabled = bool(payload.get("enabled"))
    from services.final_decision import set_auto_decide

    stored = set_auto_decide(DB_PATH, hr_id, enabled)
    return {"success": True, "auto_decide_candidates": stored}
