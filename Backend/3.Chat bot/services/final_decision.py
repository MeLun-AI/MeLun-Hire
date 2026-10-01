"""Post-interview SELECT / REJECT decision for a completed AI interview.

This module owns the *decision* and the per-HR automatic-decision switch. It is
the single implementation used by both decision modes, so the automatic and the
manual path can never drift apart:

* ``POST /hr/applicant/decision`` - a recruiter approves/selects or rejects a
  candidate after reading the interview report;
* ``maybe_auto_decide`` - called by the interview submission flow, right after
  the interview is really completed, when the HR has automatic decisions ON.

Design notes (smallest production-safe scope):

* The decision is stored on the existing ``applications`` row through additive
  columns (PRAGMA-guarded, the same pattern as ``interview_code_send_method``).
  ``final_decision`` holds exactly ONE value (``selected`` / ``rejected``), so a
  candidate can never be both selected and rejected.
* The score used for the decision is the authoritative final interview score
  computed by ``services.interview_scoring`` - the same number the recruiter
  sees on the report. Nothing is calculated in the frontend and no score is
  invented.
* Idempotency: a decision is only recorded once (guarded by
  ``final_decision IS NULL``), and the candidate email is only sent while
  ``decision_email_sent`` is 0. Refreshing, retrying or an automatic retry after
  a manual decision can therefore never create a second decision or a second
  email.
* A decision is never created before the interview is ``Completed``.
"""
from __future__ import annotations

import logging
import os
import sqlite3
from datetime import datetime

from services.interview_scoring import (
    DECISION_THRESHOLD_PERCENT,
    final_score_from_analysis_json,
)

logger = logging.getLogger(__name__)

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DB_PATH = os.path.join(BASE_DIR, "database", "database.db")

DECISION_SELECTED = "selected"
DECISION_REJECTED = "rejected"
VALID_DECISIONS = (DECISION_SELECTED, DECISION_REJECTED)

SOURCE_AUTOMATIC = "automatic"
SOURCE_MANUAL = "manual"

INTERVIEW_COMPLETED_STATUS = "Completed"


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
def ensure_decision_columns(db_path: str = DB_PATH):
    """Make sure the decision columns and the per-HR switch can be stored."""
    conn = get_conn(db_path)
    try:
        existing = {row[1] for row in conn.execute("PRAGMA table_info(applications)")}
        for name, ddl in (
            # The final post-interview decision: 'selected' | 'rejected' | NULL.
            ("final_decision", "ALTER TABLE applications ADD COLUMN final_decision TEXT"),
            # Provenance: 'automatic' (50% rule) | 'manual' (recruiter decision).
            ("final_decision_source", "ALTER TABLE applications ADD COLUMN final_decision_source TEXT"),
            # The authoritative final interview score the decision was made on.
            ("final_decision_score", "ALTER TABLE applications ADD COLUMN final_decision_score INTEGER"),
            ("final_decision_at", "ALTER TABLE applications ADD COLUMN final_decision_at TEXT"),
            # Email idempotency: 1 once the candidate has been notified.
            ("decision_email_sent", "ALTER TABLE applications ADD COLUMN decision_email_sent INTEGER DEFAULT 0"),
        ):
            if name not in existing:
                conn.execute(ddl)

        # The switch lives on the same per-HR preferences row as the other
        # HR-level settings (created by auth/routes/hr_settings.py).
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
        pref_columns = {row[1] for row in conn.execute("PRAGMA table_info(hr_notification_preferences)")}
        if "auto_decide_candidates" not in pref_columns:
            conn.execute(
                "ALTER TABLE hr_notification_preferences "
                "ADD COLUMN auto_decide_candidates INTEGER DEFAULT 0"
            )
    finally:
        conn.close()



# ---------------------------------------------------------------------------
# The per-HR switch
# ---------------------------------------------------------------------------
def auto_decide_enabled(db_path: str = DB_PATH, hr_id=None) -> bool:
    """Whether this HR lets the backend decide after a completed interview.

    An unknown / missing setting means OFF (manual decisions only).
    """
    if hr_id is None:
        return False
    try:
        ensure_decision_columns(db_path)
        conn = get_conn(db_path)
        try:
            row = conn.execute(
                "SELECT auto_decide_candidates FROM hr_notification_preferences "
                "WHERE hr_id = ?",
                (int(hr_id),),
            ).fetchone()
        finally:
            conn.close()
    except Exception:
        # A settings read must never break an interview submission.
        logger.exception("Could not read auto-decision setting for hr_id=%s", hr_id)
        return False
    return bool(row[0]) if row else False


def set_auto_decide(db_path: str, hr_id, enabled: bool) -> bool:
    """Persist the switch for this HR (idempotent upsert)."""
    value = 1 if enabled else 0
    ensure_decision_columns(db_path)
    conn = get_conn(db_path)
    try:
        conn.execute(
            """
            INSERT INTO hr_notification_preferences (hr_id, auto_decide_candidates)
            VALUES (?, ?)
            ON CONFLICT(hr_id) DO UPDATE SET
                auto_decide_candidates = excluded.auto_decide_candidates
            """,
            (int(hr_id), value),
        )
    finally:
        conn.close()
    return bool(value)


# ---------------------------------------------------------------------------
# Decision helpers
# ---------------------------------------------------------------------------
def _application_row(db_path: str, application_id):
    """Everything a decision needs, resolved from the database (source of truth)."""
    conn = get_conn(db_path)
    try:
        row = conn.execute(
            """
            SELECT
                app.applicant_id,
                a.full_name,
                a.email,
                j.job_title,
                h.company_name,
                j.hr_id,
                app.interview_status,
                app.final_decision,
                app.decision_email_sent,
                ir.analysis_json
            FROM applications app
            JOIN applicants a ON app.applicant_id = a.id
            JOIN hr_job_posts j ON app.job_id = j.id
            JOIN hr_users h ON j.hr_id = h.id
            LEFT JOIN interview_reports ir ON ir.application_id = app.id
            WHERE app.id = ?
            """,
            (application_id,),
        ).fetchone()
    finally:
        conn.close()

    if not row:
        return None

    return {
        "applicant_id": row[0],
        "full_name": row[1],
        "email": row[2],
        "job_title": row[3],
        "company_name": row[4],
        "hr_id": row[5],
        "interview_status": row[6],
        "final_decision": row[7],
        "decision_email_sent": int(row[8] or 0),
        "analysis_json": row[9],
    }


def _send_decision_email(row: dict, decision: str) -> bool:
    """Email the candidate their decision. Never raises."""
    if not row.get("email"):
        return False
    try:
        # Lazy import: keeps this module independent of the email transport.
        from services.decision_email import send_decision_email

        return bool(
            send_decision_email(
                decision=decision,
                to_email=row["email"],
                candidate_name=row.get("full_name") or "",
                job_title=row.get("job_title") or "",
                company_name=row.get("company_name") or "",
            )
        )
    except Exception:
        logger.exception("Decision email failed (decision=%s)", decision)
        return False


def _notify_applicant(row: dict, decision: str, application_id) -> None:
    """In-app notification for the candidate (same type as the existing flow)."""
    if not row.get("applicant_id"):
        return
    try:
        from routes.hr_notifications import create_notification

        if decision == DECISION_SELECTED:
            create_notification(
                applicant_id=row["applicant_id"],
                application_id=application_id,
                type="application",
                title="Application Selected",
                message=(
                    f"Congratulations {row.get('full_name') or ''}, your application "
                    f"for {row.get('job_title') or 'the role'} has been selected."
                ),
            )
        else:
            create_notification(
                applicant_id=row["applicant_id"],
                application_id=application_id,
                type="application",
                title="Application Not Selected",
                message=(
                    f"Thank you for applying to {row.get('job_title') or 'the role'}. "
                    "Your application was not selected this time."
                ),
            )
    except Exception:
        logger.exception("Decision notification failed for application_id=%s", application_id)


# ---------------------------------------------------------------------------
# Record the decision (shared by the manual and the automatic path)
# ---------------------------------------------------------------------------
def record_decision(
    db_path: str,
    application_id,
    decision: str,
    *,
    source: str = SOURCE_MANUAL,
    hr_id=None,
    score=None,
) -> dict:
    """Record ONE final decision for a completed interview, then email the candidate.

    Returns ``{"status": ...}`` where status is one of:

    * ``"recorded"``        - this call stored the decision (email attempted);
    * ``"already_decided"`` - the same decision already existed (idempotent, no
      second email is sent; a previously failed email is retried once);
    * ``"not_completed"``   - the interview is not completed yet (no decision);
    * ``"conflict"``        - the candidate already has the OPPOSITE decision;
    * ``"no_score"``        - no real interview score is available (automatic
      mode only; a human decision is still allowed);
    * ``"not_found"``       - unknown application / not owned by this HR;
    * ``"invalid"``         - unknown decision value.
    """
    if decision not in VALID_DECISIONS:
        return {"status": "invalid", "final_decision": None}

    ensure_decision_columns(db_path)

    row = _application_row(db_path, application_id)
    if not row:
        return {"status": "not_found", "final_decision": None}
    if hr_id is not None and int(row.get("hr_id") or 0) != int(hr_id):
        # Never reveal another company's application.
        return {"status": "not_found", "final_decision": None}

    if (row.get("interview_status") or "") != INTERVIEW_COMPLETED_STATUS:
        return {"status": "not_completed", "final_decision": None}

    # The authoritative final interview score (never invented in the frontend).
    if score is None:
        score = final_score_from_analysis_json(row.get("analysis_json"))

    if score is None and source == SOURCE_AUTOMATIC:
        # The automatic rule is defined by the score, so without a real score
        # there is nothing to decide on. HR decides manually instead.
        logger.warning(
            "Automatic decision skipped: no interview score for application_id=%s",
            application_id,
        )
        return {"status": "no_score", "final_decision": None}

    existing = row.get("final_decision")
    already_decided = bool(existing)
    if already_decided and existing != decision:
        return {
            "status": "conflict",
            "final_decision": existing,
            "final_decision_source": row.get("final_decision_source"),
        }

    if not already_decided:
        conn = get_conn(db_path)
        try:
            cur = conn.execute(
                """
                UPDATE applications
                SET final_decision = ?,
                    final_decision_source = ?,
                    final_decision_score = ?,
                    final_decision_at = ?
                WHERE id = ? AND final_decision IS NULL
                """,
                (decision, source, score, datetime.utcnow().isoformat(), application_id),
            )
            stored = cur.rowcount > 0
        finally:
            conn.close()

        if not stored:
            # Another request decided this candidate in the meantime. Never
            # overwrite it - report whatever is stored now.
            current = _application_row(db_path, application_id)
            same = bool(current) and current.get("final_decision") == decision
            return {
                "status": "already_decided" if same else "conflict",
                "final_decision": current.get("final_decision") if current else None,
                "final_decision_source": current.get("final_decision_source") if current else None,
            }

    # Re-read so the response (and the source) always reflects the database.
    current = _application_row(db_path, application_id) or row
    email_sent = bool(current.get("decision_email_sent"))
    email_warning = False

    if not email_sent:
        # Sent only AFTER the decision was saved, and only while no email was
        # ever confirmed, so retries can never duplicate the candidate email.
        email_sent = _send_decision_email(current, decision)
        email_warning = not email_sent
        if email_sent:
            conn = get_conn(db_path)
            try:
                conn.execute(
                    "UPDATE applications SET decision_email_sent = 1 WHERE id = ?",
                    (application_id,),
                )
            finally:
                conn.close()

    if not already_decided:
        # One in-app notification per decision (never per retry).
        _notify_applicant(current, decision, application_id)

    return {
        "status": "recorded" if not already_decided else "already_decided",
        "final_decision": decision,
        "final_decision_source": current.get("final_decision_source") or source,
        "final_decision_score": current.get("final_decision_score", score),
        "decision_email_sent": 1 if email_sent else 0,
        "already_decided": already_decided,
        "email_warning": email_warning,
    }


def maybe_auto_decide(db_path: str, application_id):
    """Apply the HR's automatic decision to ONE completed interview.

    Called right after an interview is really completed. Returns the recorded
    result, or ``None`` when the switch is off / the interview is not completed
    / a decision already exists. Never raises: an automatic decision must never
    break the applicant's interview submission.
    """
    try:
        ensure_decision_columns(db_path)
        row = _application_row(db_path, application_id)
    except Exception:
        logger.exception("Could not read application for auto decision (id=%s)", application_id)
        return None

    if not row:
        return None
    if (row.get("interview_status") or "") != INTERVIEW_COMPLETED_STATUS:
        return None
    if row.get("final_decision"):
        # Already decided once - never decide (or email) again.
        return None
    if not auto_decide_enabled(db_path, row.get("hr_id")):
        return None

    score = final_score_from_analysis_json(row.get("analysis_json"))
    if score is None:
        logger.warning(
            "Automatic decision skipped (no interview score) for application_id=%s",
            application_id,
        )
        return None

    decision = (
        DECISION_SELECTED
        if score >= DECISION_THRESHOLD_PERCENT
        else DECISION_REJECTED
    )

    try:
        result = record_decision(
            db_path,
            application_id,
            decision,
            source=SOURCE_AUTOMATIC,
            hr_id=row.get("hr_id"),
            score=score,
        )
    except Exception:
        logger.exception("Automatic decision failed for application_id=%s", application_id)
        return None

    logger.info(
        "Automatic decision '%s' for application_id=%s (score=%s%%)",
        decision,
        application_id,
        score,
    )
    return result
