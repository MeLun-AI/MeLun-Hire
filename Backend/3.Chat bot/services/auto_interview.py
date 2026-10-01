"""Automatic interview-code delivery for newly matched applications.

This module owns the interview-code *setting* and the shared issuance logic.
It is deliberately a single implementation used by both callers, so the
automatic and manual paths can never drift apart or create competing codes:

* ``POST /hr/applicant/interview-code`` (HR sends / re-sends manually)
* the apply flow in ``auth/routes/applicant_auth.py`` (auto-sends for a newly
  MATCHED application when the HR has automatic interview codes enabled)

Everything is scoped to ONE application (one candidate + one job). No second
interview-code store is introduced: the existing ``applications`` columns
(``interview_code``, ``interview_status``, ``interview_expires_at``,
``code_email_sent``) are reused, plus one additive provenance column
``interview_code_send_method`` (``'automatic'`` / ``'manual'``) so HR can tell
how a code was delivered.

Scope of the ON/OFF switch: the HR Applicants page (and ``GET /hr/applicants/
{hr_id}``) lists applications across *all* of the HR's job posts, so the
setting is stored per HR account (the existing ``hr_notification_preferences``
row), matching how the platform already persists HR-level preferences.
"""
from __future__ import annotations

import logging
import os
import random
import sqlite3
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DB_PATH = os.path.join(BASE_DIR, "database", "database.db")

# How long a generated interview code stays valid (unchanged - same value the
# existing manual endpoint used).
CODE_TTL_HOURS = 24

SEND_METHOD_AUTOMATIC = "automatic"
SEND_METHOD_MANUAL = "manual"


def get_conn(db_path: str = DB_PATH):
    conn = sqlite3.connect(
        db_path, timeout=30, check_same_thread=False, isolation_level=None
    )
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA busy_timeout=30000;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    return conn


# ---------------------------------------------------------------------------
# Schema (additive, PRAGMA-guarded - same pattern as the rest of the project)
# ---------------------------------------------------------------------------
def ensure_prefs_columns(db_path: str = DB_PATH):
    """Make sure the per-HR automatic-send preference can be stored.

    The preferences table is created by ``auth/routes/hr_settings.py``; this
    guard keeps the setting usable when the apply flow runs first (for example
    on a fresh database or in tests).
    """
    conn = get_conn(db_path)
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS hr_notification_preferences (
                hr_id INTEGER PRIMARY KEY,
                new_applicant INTEGER DEFAULT 1,
                interview INTEGER DEFAULT 1,
                reissue INTEGER DEFAULT 1,
                job INTEGER DEFAULT 1
            )
            """
        )
        cur = conn.execute("PRAGMA table_info(hr_notification_preferences)")
        columns = [col[1] for col in cur.fetchall()]
        if "auto_interview_codes" not in columns:
            conn.execute(
                "ALTER TABLE hr_notification_preferences "
                "ADD COLUMN auto_interview_codes INTEGER DEFAULT 0"
            )
    finally:
        conn.close()


def ensure_application_columns(db_path: str = DB_PATH):
    """Add the delivery-provenance column used by the applicant cards."""
    conn = get_conn(db_path)
    try:
        cur = conn.execute("PRAGMA table_info(applications)")
        columns = [col[1] for col in cur.fetchall()]
        if "interview_code_send_method" not in columns:
            conn.execute(
                "ALTER TABLE applications ADD COLUMN interview_code_send_method TEXT"
            )
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# The per-HR switch
# ---------------------------------------------------------------------------
def auto_interview_codes_enabled(db_path: str, hr_id) -> bool:
    """Whether this HR auto-sends interview codes to newly matched candidates.

    An unknown / missing setting means OFF.
    """
    if hr_id is None:
        return False
    try:
        ensure_prefs_columns(db_path)
        conn = get_conn(db_path)
        try:
            row = conn.execute(
                "SELECT auto_interview_codes FROM hr_notification_preferences "
                "WHERE hr_id = ?",
                (int(hr_id),),
            ).fetchone()
        finally:
            conn.close()
    except Exception:
        # A settings read must never break an apply; default to OFF.
        logger.exception(
            "Could not read auto interview-code setting for hr_id=%s", hr_id
        )
        return False
    return bool(row[0]) if row else False


def set_auto_interview_codes(db_path: str, hr_id, enabled: bool) -> bool:
    """Persist the switch for this HR (idempotent upsert)."""
    value = 1 if enabled else 0
    ensure_prefs_columns(db_path)
    conn = get_conn(db_path)
    try:
        conn.execute(
            """
            INSERT INTO hr_notification_preferences (hr_id, auto_interview_codes)
            VALUES (?, ?)
            ON CONFLICT(hr_id) DO UPDATE SET
                auto_interview_codes = excluded.auto_interview_codes
            """,
            (int(hr_id), value),
        )
    finally:
        conn.close()
    return bool(value)


# ---------------------------------------------------------------------------
# Shared interview-code issuance (manual endpoint + automatic path)
# ---------------------------------------------------------------------------
def _new_code(job_domain: str) -> str:
    """Same format the manual endpoint has always generated."""
    domain_code = (job_domain or "")[:2].upper()
    return f"QUNO-{domain_code}-{random.randint(10000, 99999)}"


def issue_interview_code(
    db_path: str,
    application_id,
    *,
    hr_id=None,
    send_method: str = SEND_METHOD_MANUAL,
    job_domain: str | None = None,
) -> dict:
    """Generate (when needed) and deliver the interview code for ONE application.

    Returns the manual endpoint's established response shape:
    ``{interview_code, expires_at, code_email_sent, code_send_method}`` plus a
    ``warning`` when generation succeeded but email delivery did not.

    Idempotency:
    * an existing ``interview_code`` is reused, never regenerated;
    * the email is sent only while ``code_email_sent`` is still 0, so a page
      refresh, a retry or repeated automatic processing cannot create a
      duplicate code or a duplicate email;
    * ``interview_code_send_method`` records how the code was first delivered
      and is never overwritten by a later resend.

    Returns ``{"error": "Application not found"}`` when the application does
    not exist, or when ``hr_id`` is given and does not own it - the same
    outcome the manual endpoint produced for a foreign application.
    """
    ensure_application_columns(db_path)

    conn = get_conn(db_path)
    try:
        row = conn.execute(
            """
            SELECT
                app.interview_code,
                app.interview_expires_at,
                a.email,
                a.id,
                j.hr_id,
                app.code_email_sent,
                app.interview_code_send_method,
                j.job_domain
            FROM applications app
            JOIN applicants a ON app.applicant_id = a.id
            JOIN hr_job_posts j ON app.job_id = j.id
            WHERE app.id = ?
            """,
            (application_id,),
        ).fetchone()
    finally:
        conn.close()

    if not row:
        return {"error": "Application not found"}

    owner_hr_id = row[4]
    if hr_id is not None and int(owner_hr_id or 0) != int(hr_id):
        return {"error": "Application not found"}

    interview_code = row[0]
    existing_expires_at = row[1]
    applicant_email = row[2]
    applicant_id = row[3]
    code_already_sent = bool(row[5])
    existing_method = row[6]
    domain = job_domain if job_domain else (row[7] or "")

    code = _new_code(domain)
    expires_at = (datetime.utcnow() + timedelta(hours=CODE_TTL_HOURS)).isoformat()

    if not interview_code:
        conn = get_conn(db_path)
        try:
            conn.execute(
                """
                UPDATE applications
                SET interview_code = ?,
                    interview_status = 'Not Started',
                    interview_expires_at = ?
                WHERE id = ?
                """,
                (code, expires_at, application_id),
            )
        finally:
            conn.close()
    else:
        code = interview_code

    final_code = interview_code if interview_code else code

    # Deliver only when delivery has never been confirmed for this application.
    email_sent = False
    if code_already_sent:
        email_sent = True
    elif applicant_email:
        try:
            # Lazy import: main.py imports the routers that import this module.
            from main import send_interview_email

            send_interview_email(applicant_email, final_code, domain)
            email_sent = True
        except Exception:
            logger.exception(
                "Failed to send interview code email for application_id=%s",
                application_id,
            )

    # Keep the original provenance; only record it on a successful delivery.
    method_to_store = existing_method
    if email_sent and not existing_method:
        method_to_store = send_method

    conn = get_conn(db_path)
    try:
        conn.execute(
            "UPDATE applications SET code_email_sent = ?, "
            "interview_code_send_method = ? WHERE id = ?",
            (1 if email_sent else 0, method_to_store, application_id),
        )
    finally:
        conn.close()

    response = {
        "interview_code": final_code,
        "expires_at": existing_expires_at or expires_at,
        "code_email_sent": 1 if email_sent else 0,
        "code_send_method": method_to_store,
    }

    if not email_sent:
        response["warning"] = (
            "Interview code was generated, but email delivery failed. "
            "Please share the code with the applicant manually."
        )

    # Notify the applicant only on a first confirmed delivery, so repeated
    # calls never spam them.
    if not code_already_sent and email_sent and applicant_id:
        try:
            from routes.hr_notifications import create_notification

            create_notification(
                applicant_id=applicant_id,
                application_id=application_id,
                type="interview_code",
                title="Interview Ready",
                message=(
                    f"Your AI interview for {domain} is ready. "
                    "Open My Applications to start."
                ),
            )
        except Exception:
            logger.exception(
                "Interview-code notification failed for application_id=%s",
                application_id,
            )

    return response


def maybe_auto_send_interview_code(db_path: str, application_id) -> dict | None:
    """Auto-send the interview code for a MATCHED application, when enabled.

    Called by the apply flow right after the match outcome is stored on the
    application. Returns the issuance result when a code was delivered now,
    otherwise ``None``.

    Safety rules (all required by the product spec):
    * only ``match_status = 'matched'`` is eligible - an unmatched attempt is
      never emailed;
    * only when the HR's persisted switch is ON;
    * never when a code was already delivered, so refreshing / reloading the
      HR page or retrying can never send a second code;
    * the matched application is never lost when delivery fails - failures are
      only logged, ``code_email_sent`` stays 0 and HR can still send manually.
    """
    try:
        conn = get_conn(db_path)
        try:
            row = conn.execute(
                """
                SELECT app.match_status, j.hr_id, app.code_email_sent, j.job_domain
                FROM applications app
                JOIN hr_job_posts j ON app.job_id = j.id
                WHERE app.id = ?
                """,
                (application_id,),
            ).fetchone()
        finally:
            conn.close()
    except Exception:
        logger.exception(
            "Could not read application for auto interview code (id=%s)",
            application_id,
        )
        return None

    if not row:
        return None

    match_status, hr_id, code_email_sent, job_domain = row
    if (match_status or "").strip().lower() != "matched":
        return None
    if code_email_sent:
        return None
    if not auto_interview_codes_enabled(db_path, hr_id):
        return None

    try:
        result = issue_interview_code(
            db_path,
            application_id,
            hr_id=hr_id,
            send_method=SEND_METHOD_AUTOMATIC,
            job_domain=job_domain,
        )
    except Exception:
        logger.exception(
            "Automatic interview code failed for application_id=%s", application_id
        )
        return None

    if result.get("code_email_sent"):
        logger.info(
            "Automatic interview code delivered for application_id=%s", application_id
        )
    else:
        logger.warning(
            "Automatic interview code was not delivered for application_id=%s "
            "(HR can send it manually)",
            application_id,
        )
    return result
