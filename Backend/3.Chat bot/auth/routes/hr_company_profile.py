from fastapi import APIRouter, Body, Depends, HTTPException
import logging
import sqlite3

from auth.sessions import current_hr_id, get_current_hr, require_hr_ownership

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/hr", tags=["HR Company Profile"])


from config.paths import DB_PATH

# =================================================
# FETCH COMPANY PROFILE
# =================================================
@router.get("/company-profile/{hr_id}")
def get_company_profile(hr_id: str, sess: dict = Depends(get_current_hr)):
    # Authorization: an HR may only read their own company profile.
    hr_id = str(require_hr_ownership(hr_id, sess))
    try:

        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()

        cur.execute("""
            SELECT
                company_name,
                hr_name,
                company_email,
                company_location,
                company_website,
                company_linkedin,
                company_instagram,
                company_size,
                about_company
            FROM hr_company_profile
            WHERE hr_id = ?
        """, (hr_id,))

        row = cur.fetchone()
        conn.close()

        if not row:
            return {}

        return {
            "company_name": row[0],
            "hr_name": row[1],
            "company_email": row[2],
            "company_location": row[3],
            "company_website": row[4],
            "company_linkedin": row[5],
            "company_instagram": row[6],
            "company_size": row[7],
            "about_company": row[8],
        }

    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to load company profile for hr_id=%s", hr_id)
        raise HTTPException(status_code=500, detail="Could not load company profile. Please try again.")



# =================================================
# SAVE / UPDATE COMPANY PROFILE
# =================================================
@router.post("/company-profile")
def save_company_profile(payload: dict = Body(...), sess: dict = Depends(get_current_hr)):
    # Authorization: the profile is always written for the authenticated HR.
    # A different hr_id in the body is rejected instead of being trusted.
    session_hr_id = current_hr_id(sess)
    body_hr_id = payload.get("hr_id")
    if body_hr_id is not None and str(body_hr_id) != str(session_hr_id):
        raise HTTPException(status_code=403, detail="Not your resource.")
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()

        cur.execute("""
            INSERT INTO hr_company_profile (
                hr_id,
                company_name,
                hr_name,
                company_email,
                company_location,
                company_website,
                company_linkedin,
                company_instagram,
                company_size,
                about_company
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(hr_id) DO UPDATE SET
                company_name = excluded.company_name,
                hr_name = excluded.hr_name,
                company_email = excluded.company_email,
                company_location = excluded.company_location,
                company_website = excluded.company_website,
                company_linkedin = excluded.company_linkedin,
                company_instagram = excluded.company_instagram,
                company_size = excluded.company_size,
                about_company = excluded.about_company
        """, (
            session_hr_id,
            payload.get("company_name"),
            payload.get("hr_name"),
            payload.get("company_email"),
            payload.get("company_location"),
            payload.get("company_website"),
            payload.get("company_linkedin"),
            payload.get("company_instagram"),
            payload.get("company_size"),
            payload.get("about_company"),
        ))

        conn.commit()
        conn.close()

        return {"success": True}

    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to save company profile for hr_id=%s", session_hr_id)
        raise HTTPException(status_code=500, detail="Could not save company profile. Please try again.")

