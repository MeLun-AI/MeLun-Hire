"""Server-authoritative proctoring state (Phase 3 / 2G).

The browser still *detects* proctoring signals (the existing face-detection
algorithm is untouched); it may only REPORT what it observed. Warning counts,
violation state, termination and post-violation eligibility are all derived from
rows persisted in `proctoring_violations`, so a client can never:

  * claim it has zero violations,
  * decrement or reset a warning count,
  * change the violation state,
  * terminate (or un-terminate) an interview it does not own.

Ownership is always resolved from the authenticated session
(applicant -> application) and never from the request body.
"""
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth.sessions import get_current_applicant
from auth.authorization import require_applicant_owns_application

import os
import sqlite3

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DB_PATH = os.path.join(BASE_DIR, "database", "database.db")

router = APIRouter(prefix="/interview", tags=["Proctoring"])


# ------------------------------------------------------------------
# Policy (server-owned — the client cannot change any of these)
# ------------------------------------------------------------------

MAX_WARNINGS = 3
# Same-type events closer together than this are treated as one observation
# (mirrors the client's per-type cooldown) so event spam cannot inflate or
# fabricate a count.
DEDUPE_WINDOW_SECONDS = 3
# Event types the server accepts from a client.
ALLOWED_EVENT_TYPES = frozenset({
    "browser_minimized",
    "tab_switch",
    "window_blur",
    "fullscreen_exit",
    "multiple_faces",
    "face_missing",
    "camera_blocked",
    # Explicit "End Interview" action in the violation dialog.
    "manual",
})
# Server-side policy: these end the interview immediately instead of counting
# as one of the 3 warnings (this preserves the existing product behaviour for
# a camera that stops producing frames mid-interview).
TERMINATING_EVENT_TYPES = frozenset({"camera_blocked", "manual"})
# A violation may only be recorded while the interview is actually running.
EVENT_ACCEPTED_STATUS = "In Progress"

_VIOLATIONS_TABLE_SQL = """
    CREATE TABLE IF NOT EXISTS proctoring_violations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        application_id INTEGER NOT NULL,
        applicant_id TEXT NOT NULL,
        violation_type TEXT NOT NULL,
        warning_number INTEGER NOT NULL,
        client_timestamp TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (application_id) REFERENCES applications(id)
    )
"""
_VIOLATIONS_INDEX_SQL = (
    "CREATE INDEX IF NOT EXISTS idx_proctoring_violations_application "
    "ON proctoring_violations(application_id)"
)


# ------------------------------------------------------------------
# Database helpers (same connection pattern as the other routers)
# ------------------------------------------------------------------

def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30, check_same_thread=False, isolation_level=None)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA busy_timeout=30000;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    return conn


def ensure_proctoring_schema() -> None:
    """Create the proctoring tables (idempotent, additive only)."""
    conn = get_conn()
    try:
        conn.execute(_VIOLATIONS_TABLE_SQL)
        conn.execute(_VIOLATIONS_INDEX_SQL)
    finally:
        conn.close()


def count_violations(application_id) -> int:
    """Server-side warning count for an application (0 when unknown)."""
    conn = get_conn()
    try:
        row = conn.execute(
            "SELECT COUNT(*) FROM proctoring_violations WHERE application_id = ?",
            (application_id,),
        ).fetchone()
    finally:
        conn.close()
    return int(row[0]) if row else 0


def _notify_hr_once(application_id: int) -> None:
    """Tell the owning HR that this interview was terminated by proctoring."""
    from routes.hr_notifications import create_notification

    conn = get_conn()
    try:
        row = conn.execute(
            """
            SELECT j.hr_id, a.full_name FROM applications app
            JOIN hr_job_posts j ON app.job_id = j.id
            JOIN applicants a ON app.applicant_id = a.id
            WHERE app.id = ?
            """,
            (application_id,),
        ).fetchone()
    finally:
        conn.close()
    if not row:
        return
    create_notification(
        hr_id=row[0],
        application_id=application_id,
        type="interview_status",
        title="Interview Violated",
        message=f"{row[1]}'s interview was terminated by proctoring.",
    )


# ------------------------------------------------------------------
# Authoritative state shape
# ------------------------------------------------------------------

def _state(
    warning_count: int,
    interview_status: Optional[str],
    terminated: bool,
    application_id=None,
) -> Dict:
    """Build the authoritative proctoring state returned to the client.

    Every field is derived from persisted server state. `warning_count` is
    always the server's own count from `proctoring_violations`; the client can
    never supply, reset or decrement it.
    """
    count = max(0, int(warning_count or 0))
    return {
        "application_id": application_id,
        "warning_count": count,
        "warnings_remaining": max(0, MAX_WARNINGS - count),
        "max_warnings": MAX_WARNINGS,
        "terminated": bool(terminated),
        "can_continue": not terminated,
        "interview_status": interview_status,
    }


# ------------------------------------------------------------------
# Authoritative state transitions
# ------------------------------------------------------------------

def record_event(
    application_id,
    applicant_id: str,
    event_type: str,
    client_timestamp: Optional[str] = None,
) -> Dict:
    """Record a client-reported proctoring event and return the authoritative state.

    The caller must already be authenticated as `applicant_id`; ownership is
    re-verified against the database here so a spoofed application id can never
    touch another applicant's proctoring record.
    """
    if event_type not in ALLOWED_EVENT_TYPES:
        raise HTTPException(status_code=400, detail="Unknown proctoring event type.")

    try:
        app_id = int(application_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Missing application_id")

    terminate = False
    warning_number = 0
    interview_status: Optional[str] = None

    conn = get_conn()
    try:
        conn.execute("BEGIN IMMEDIATE")

        row = conn.execute(
            "SELECT applicant_id, interview_status FROM applications WHERE id = ?",
            (app_id,),
        ).fetchone()
        if not row or str(row[0]) != str(applicant_id):
            conn.execute("ROLLBACK")
            raise HTTPException(status_code=404, detail="Application not found.")

        interview_status = row[1]

        def current_count() -> int:
            return int(conn.execute(
                "SELECT COUNT(*) FROM proctoring_violations WHERE application_id = ?",
                (app_id,),
            ).fetchone()[0])

        # Only a running interview can collect violations. A completed/expired
        # interview cannot be "re-opened" and a terminated one cannot collect
        # further events (which would also grow the table without limit).
        if interview_status != EVENT_ACCEPTED_STATUS:
            count = current_count()
            conn.execute("ROLLBACK")
            state = _state(count, interview_status, terminated=True, application_id=app_id)
            state.update({"success": True, "accepted": False, "duplicate": False,
                          "event_type": event_type})
            return state

        cutoff = (datetime.utcnow() - timedelta(seconds=DEDUPE_WINDOW_SECONDS)).isoformat()
        duplicate = conn.execute(
            """
            SELECT COUNT(*) FROM proctoring_violations
            WHERE application_id = ? AND violation_type = ? AND created_at >= ?
            """,
            (app_id, event_type, cutoff),
        ).fetchone()[0]
        if duplicate:
            count = current_count()
            conn.execute("ROLLBACK")
            state = _state(count, interview_status, terminated=False, application_id=app_id)
            state.update({"success": True, "accepted": False, "duplicate": True,
                          "event_type": event_type})
            return state

        warning_number = current_count() + 1
        now = datetime.utcnow()

        conn.execute(
            """
            INSERT INTO proctoring_violations (
                application_id, applicant_id, violation_type,
                warning_number, client_timestamp, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (app_id, str(applicant_id), event_type, warning_number,
             (client_timestamp or None), now.isoformat()),
        )

        terminate = event_type in TERMINATING_EVENT_TYPES or warning_number >= MAX_WARNINGS
        if terminate:
            conn.execute(
                "UPDATE applications SET interview_status = 'Violated' WHERE id = ?",
                (app_id,),
            )
            interview_status = "Violated"

        conn.execute("COMMIT")
    except HTTPException:
        raise
    except Exception:
        try:
            conn.execute("ROLLBACK")
        except sqlite3.Error:
            pass
        raise
    finally:
        conn.close()

    if terminate:
        # The violation is already persisted — a notification problem must
        # never fail the request.
        try:
            _notify_hr_once(app_id)
        except Exception:
            pass

    state = _state(warning_number, interview_status, terminated=terminate, application_id=app_id)
    state.update({"success": True, "accepted": True, "duplicate": False,
                  "event_type": event_type})
    return state


def state_for(application_id, applicant_id: str) -> Dict:
    """Read the authoritative proctoring state for the caller's own application."""
    # Database-derived ownership: 404 when the application is not this applicant's.
    require_applicant_owns_application(applicant_id, application_id)
    app_id = int(application_id)

    conn = get_conn()
    try:
        row = conn.execute(
            "SELECT interview_status FROM applications WHERE id = ?", (app_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Application not found.")
        interview_status = row[0]

        count = int(conn.execute(
            "SELECT COUNT(*) FROM proctoring_violations WHERE application_id = ?",
            (app_id,),
        ).fetchone()[0])

        timeline: List[Dict] = [
            {"event_type": r[0], "warning_number": r[1], "created_at": r[2]}
            for r in conn.execute(
                """
                SELECT violation_type, warning_number, created_at
                FROM proctoring_violations WHERE application_id = ?
                ORDER BY id ASC LIMIT 50
                """,
                (app_id,),
            ).fetchall()
        ]
    finally:
        conn.close()

    terminated = interview_status == "Violated" or count >= MAX_WARNINGS
    state = _state(count, interview_status, terminated=terminated, application_id=app_id)
    state.update({"violations": timeline})
    return state


# ------------------------------------------------------------------
# API
# ------------------------------------------------------------------

class ProctoringEventRequest(BaseModel):
    application_id: int
    event_type: str
    client_timestamp: Optional[str] = None


@router.post("/proctoring-event")
def report_proctoring_event(
    payload: ProctoringEventRequest,
    sess: dict = Depends(get_current_applicant),
) -> Dict:
    """Applicant reports ONE observed proctoring violation.

    The applicant id always comes from the session; the server decides the
    warning count, the violation state and whether the interview is terminated.
    """
    applicant_id = str(sess.get("applicant_id") or "")
    if not applicant_id:
        raise HTTPException(status_code=403, detail="Authentication required.")

    return record_event(
        payload.application_id,
        applicant_id,
        str(payload.event_type or "").strip().lower(),
        payload.client_timestamp,
    )


@router.get("/proctoring-state/{application_id}")
def get_proctoring_state(
    application_id: int,
    sess: dict = Depends(get_current_applicant),
) -> Dict:
    """Applicant re-reads the authoritative proctoring state (e.g. on resume)."""
    applicant_id = str(sess.get("applicant_id") or "")
    if not applicant_id:
        raise HTTPException(status_code=403, detail="Authentication required.")

    return state_for(application_id, applicant_id)
