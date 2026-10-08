from datetime import datetime
import sqlite3
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from auth.sessions import (
    get_current_applicant,
    get_current_hr,
    require_applicant_ownership,
    require_hr_ownership,
)
from auth.authorization import applicant_owns_notification, hr_owns_notification

router = APIRouter(prefix="/hr", tags=["HR Notifications"])
applicant_notifications_router = APIRouter(prefix="/applicant", tags=["Applicant Notifications"])

from config.paths import DB_PATH
from database.schema import ensure_columns


def get_conn():
    conn = sqlite3.connect(DB_PATH, timeout=30, check_same_thread=False, isolation_level=None)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA busy_timeout=30000;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    return conn


# One table serves HR users and applicants (hr_id / applicant_id).
_NOTIFICATIONS_TABLE_SQL = """
    CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hr_id INTEGER NULL,
        applicant_id TEXT NULL,
        application_id INTEGER NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        is_read INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
    )
"""

_NOTIFICATIONS_HR_INDEX_SQL = (
    "CREATE INDEX IF NOT EXISTS idx_notifications_hr_created "
    "ON notifications(hr_id, created_at DESC)"
)
_NOTIFICATIONS_APPLICANT_INDEX_SQL = (
    "CREATE INDEX IF NOT EXISTS idx_notifications_applicant_created "
    "ON notifications(applicant_id, created_at DESC)"
)

# Columns added after the table was first released. SQLite cannot add a column
# to an existing table through CREATE TABLE, so they are applied one by one.
_NOTIFICATIONS_COLUMNS = {
    "hr_id": "INTEGER NULL",
    "applicant_id": "TEXT NULL",
    "application_id": "INTEGER NULL",
    "is_read": "INTEGER DEFAULT 0",
}


def ensure_notifications_table():
    """Make sure the shared notifications table exists with the current layout.

    One table serves HR users and applicants (``hr_id`` / ``applicant_id``). A
    fresh database simply gets the table; a database created before applicant
    notifications existed gets the missing columns added in place. Nothing is
    ever dropped, so no notification is lost.

    The previous implementation always rebuilt the table by copying from
    ``notifications``, which on a fresh deployment failed at import time with
    ``sqlite3.OperationalError: no such table: notifications``.
    """
    conn = get_conn()
    try:
        conn.execute("BEGIN IMMEDIATE")
        conn.execute(_NOTIFICATIONS_TABLE_SQL)
        ensure_columns(conn, "notifications", _NOTIFICATIONS_COLUMNS)
        conn.execute(_NOTIFICATIONS_HR_INDEX_SQL)
        conn.execute(_NOTIFICATIONS_APPLICANT_INDEX_SQL)
    except Exception:
        conn.rollback()
        raise
    conn.commit()
    conn.close()


def create_notification(
    hr_id: Optional[int] = None,
    applicant_id: Optional[str] = None,
    application_id: Optional[int] = None,
    type: str = "general",
    title: str = "",
    message: str = "",
) -> int:
    """Create a notification for an HR user and/or an applicant."""
    if not hr_id and not applicant_id:
        return 0
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO notifications (hr_id, applicant_id, application_id, type, title, message, is_read, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    """, (hr_id, applicant_id, application_id, type, title, message, datetime.utcnow().isoformat()))
    notification_id = cur.lastrowid
    conn.commit()
    conn.close()
    return notification_id


# =================================================
# HR NOTIFICATIONS
# Every route resolves the caller from the session; the {hr_id} in the path is
# only accepted when it matches that identity.
# =================================================
@router.get("/notifications/{hr_id}")
def get_notifications(
    hr_id: int,
    sess: dict = Depends(get_current_hr),
):
    hr_id = require_hr_ownership(hr_id, sess)
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, hr_id, application_id, type, title, message, is_read, created_at
        FROM notifications WHERE hr_id = ?
        ORDER BY created_at DESC, id DESC
    """, (hr_id,))
    rows = cur.fetchall()
    conn.close()
    return [{"id": row[0], "hr_id": row[1], "application_id": row[2],
             "type": row[3], "title": row[4], "message": row[5],
             "is_read": bool(row[6]), "created_at": row[7]} for row in rows]


@router.post("/notifications/read/{notification_id}")
def mark_notification_read(
    notification_id: int,
    sess: dict = Depends(get_current_hr),
):
    hr_id = int(sess.get("hr_id"))
    # A notification id alone is never enough - it must belong to this HR.
    if not hr_owns_notification(hr_id, notification_id):
        raise HTTPException(status_code=404, detail="Notification not found")

    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "UPDATE notifications SET is_read = 1 WHERE id = ? AND hr_id = ?",
        (notification_id, hr_id),
    )
    updated = cur.rowcount
    conn.commit()
    conn.close()
    if not updated:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"success": True}


@router.post("/notifications/read-all/{hr_id}")
def mark_all_notifications_read(
    hr_id: int,
    sess: dict = Depends(get_current_hr),
):
    hr_id = require_hr_ownership(hr_id, sess)
    conn = get_conn()
    conn.execute("UPDATE notifications SET is_read = 1 WHERE hr_id = ?", (hr_id,))
    conn.commit()
    conn.close()
    return {"success": True}


@router.delete("/notifications/{hr_id}")
def delete_all_notifications(
    hr_id: int,
    sess: dict = Depends(get_current_hr),
):
    hr_id = require_hr_ownership(hr_id, sess)
    conn = get_conn()
    conn.execute("DELETE FROM notifications WHERE hr_id = ?", (hr_id,))
    conn.commit()
    conn.close()
    return {"success": True}


# =================================================
# APPLICANT NOTIFICATIONS
# =================================================
@applicant_notifications_router.get("/notifications/{applicant_id}")
def get_applicant_notifications(
    applicant_id: str,
    sess: dict = Depends(get_current_applicant),
):
    applicant_id = require_applicant_ownership(applicant_id, sess)
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, applicant_id, application_id, type, title, message, is_read, created_at
        FROM notifications WHERE applicant_id = ?
        ORDER BY created_at DESC, id DESC
    """, (applicant_id,))
    rows = cur.fetchall()
    conn.close()
    return [{"id": row[0], "applicant_id": row[1], "application_id": row[2],
             "type": row[3], "title": row[4], "message": row[5],
             "is_read": bool(row[6]), "created_at": row[7]} for row in rows]


@applicant_notifications_router.post("/notifications/read/{notification_id}")
def mark_applicant_notification_read(
    notification_id: int,
    sess: dict = Depends(get_current_applicant),
):
    applicant_id = str(sess.get("applicant_id"))
    if not applicant_owns_notification(applicant_id, notification_id):
        raise HTTPException(status_code=404, detail="Notification not found")

    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "UPDATE notifications SET is_read = 1 WHERE id = ? AND applicant_id = ?",
        (notification_id, applicant_id),
    )
    updated = cur.rowcount
    conn.commit()
    conn.close()
    if not updated:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"success": True}


@applicant_notifications_router.post("/notifications/read-all/{applicant_id}")
def mark_all_applicant_notifications_read(
    applicant_id: str,
    sess: dict = Depends(get_current_applicant),
):
    applicant_id = require_applicant_ownership(applicant_id, sess)
    conn = get_conn()
    conn.execute("UPDATE notifications SET is_read = 1 WHERE applicant_id = ?", (applicant_id,))
    conn.commit()
    conn.close()
    return {"success": True}


ensure_notifications_table()
