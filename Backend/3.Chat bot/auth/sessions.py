"""Server-side opaque session tokens for MeLun Hire (FastAPI + SQLite).

Security model
--------------
* HR/applicant sign-in creates a random opaque token. The token is the ONLY
  thing the client holds - it never encodes an identity, so a client cannot
  forge a different ``applicant_id``/``hr_id`` by editing it.
* Only the SHA-256 hash of the token is persisted, so a database leak does not
  hand out usable live sessions.
* The raw token is returned as ``auth_token`` (keeps the existing login API
  contract for non-browser clients) and is additionally set as an HttpOnly
  cookie so the SPA never has to keep the secret in JavaScript-accessible
  storage.
* Every protected route resolves identity from this store via the
  ``get_current_applicant`` / ``get_current_hr`` dependencies. Client-supplied
  ids are only ever compared against the authenticated identity.
"""
import hashlib
import logging
import os
import secrets
import sqlite3
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from fastapi import HTTPException, Request, Response, status

logger = logging.getLogger(__name__)

from config.paths import DB_PATH

# NOTE: the cookie name is intentionally unchanged — it is a technical
# identifier shared with existing sessions and the SESSION_COOKIE_NAME env var,
# not public-facing branding.
SESSION_COOKIE_NAME = os.environ.get("SESSION_COOKIE_NAME", "quno_session")
SESSION_TTL_HOURS = int(os.environ.get("SESSION_TTL_HOURS", "12"))
TOKEN_BYTES = 32

# SameSite=Lax keeps the cookie usable for the normal same-site SPA flow while
# still blocking it on cross-site POSTs. "Secure" is enabled automatically in
# production (and can be forced with SESSION_COOKIE_SECURE=true).
_COOKIE_SECURE_ENV = os.environ.get("SESSION_COOKIE_SECURE", "").strip().lower()
APP_ENV = os.environ.get("APP_ENV", "development").strip().lower()
COOKIE_SECURE = _COOKIE_SECURE_ENV in {"1", "true", "yes", "on"} or (
    not _COOKIE_SECURE_ENV and APP_ENV == "production"
)
COOKIE_SAMESITE = os.environ.get("SESSION_COOKIE_SAMESITE", "lax").strip().lower()

_table_ready = False


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30, check_same_thread=False, isolation_level=None)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA busy_timeout=30000;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    return conn


def ensure_auth_sessions_table() -> None:
    """Create the session table once per process."""
    global _table_ready
    if _table_ready:
        return
    conn = _get_conn()
    try:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS auth_sessions ("
            "id INTEGER PRIMARY KEY AUTOINCREMENT, "
            "token_hash TEXT UNIQUE NOT NULL, "
            "role TEXT NOT NULL, "
            "applicant_id TEXT NULL, "
            "hr_id INTEGER NULL, "
            "created_at TEXT NOT NULL, "
            "expires_at TEXT NOT NULL, "
            "revoked INTEGER DEFAULT 0)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(token_hash)"
        )
        conn.commit()
        _table_ready = True
    finally:
        conn.close()


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------
# SESSION LIFECYCLE
# ---------------------------------------------------------------
def create_session(
    *, role: str, applicant_id: Optional[str] = None, hr_id: Optional[int] = None
) -> Dict[str, str]:
    """Create a server-side session and return the raw token + expiry."""
    ensure_auth_sessions_table()
    raw = secrets.token_urlsafe(TOKEN_BYTES)
    now = datetime.utcnow()
    expires = now + timedelta(hours=SESSION_TTL_HOURS)
    conn = _get_conn()
    try:
        conn.execute(
            "INSERT INTO auth_sessions "
            "(token_hash, role, applicant_id, hr_id, created_at, expires_at, revoked) "
            "VALUES (?, ?, ?, ?, ?, ?, 0)",
            (_hash_token(raw), role, applicant_id, hr_id, now.isoformat(), expires.isoformat()),
        )
        conn.commit()
    finally:
        conn.close()
    return {"auth_token": raw, "expires_at": expires.isoformat() + "Z"}


def revoke_session(raw_token: str) -> None:
    """Revoke a single session (log out). Silent when the token is unknown."""
    if not raw_token:
        return
    try:
        ensure_auth_sessions_table()
        conn = _get_conn()
        try:
            conn.execute(
                "UPDATE auth_sessions SET revoked = 1 WHERE token_hash = ?",
                (_hash_token(raw_token),),
            )
            conn.commit()
        finally:
            conn.close()
    except Exception:
        logger.exception("Failed to revoke session")


def revoke_all_sessions_for(
    role: str, *, applicant_id: Optional[str] = None, hr_id: Optional[int] = None
) -> None:
    """Revoke every live session of an account (e.g. after deactivation)."""
    if not applicant_id and hr_id is None:
        return
    try:
        ensure_auth_sessions_table()
        conn = _get_conn()
        try:
            if role == "applicant" and applicant_id:
                conn.execute(
                    "UPDATE auth_sessions SET revoked = 1 "
                    "WHERE role = 'applicant' AND applicant_id = ?",
                    (str(applicant_id),),
                )
            elif role == "hr" and hr_id is not None:
                conn.execute(
                    "UPDATE auth_sessions SET revoked = 1 WHERE role = 'hr' AND hr_id = ?",
                    (int(hr_id),),
                )
            conn.commit()
        finally:
            conn.close()
    except Exception:
        logger.exception("Failed to revoke account sessions")


def purge_expired_sessions() -> None:
    """Housekeeping: drop expired rows so the table cannot grow unbounded."""
    try:
        ensure_auth_sessions_table()
        conn = _get_conn()
        try:
            conn.execute(
                "DELETE FROM auth_sessions WHERE expires_at < ?",
                (datetime.utcnow().isoformat(),),
            )
            conn.commit()
        finally:
            conn.close()
    except Exception:
        logger.exception("Failed to purge expired sessions")


# ---------------------------------------------------------------
# TOKEN EXTRACTION
# ---------------------------------------------------------------
def _raw_token_from_request(request: Optional[Request], authorization: Optional[str]) -> str:
    """Read the token from the Authorization header or the session cookie."""
    header_value = authorization
    if header_value is None and request is not None:
        header_value = request.headers.get("authorization")
    if header_value and header_value.lower().startswith("bearer "):
        return header_value[7:].strip()
    if request is not None:
        cookie_value = request.cookies.get(SESSION_COOKIE_NAME)
        if cookie_value:
            return cookie_value.strip()
    return ""


def resolve_session(
    request: Optional[Request], authorization: Optional[str] = None
) -> Dict[str, Any]:
    """Validate the caller's token and return the stored identity."""
    raw = _raw_token_from_request(request, authorization)
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required."
        )

    ensure_auth_sessions_table()
    conn = _get_conn()
    try:
        row = conn.execute(
            "SELECT role, applicant_id, hr_id, expires_at, revoked "
            "FROM auth_sessions WHERE token_hash = ?",
            (_hash_token(raw),),
        ).fetchone()
    finally:
        conn.close()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session."
        )

    role, applicant_id, hr_id, expires_at, revoked = row
    if revoked:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has been revoked. Please sign in again.",
        )
    try:
        if datetime.utcnow() > datetime.fromisoformat(str(expires_at)):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session expired. Please sign in again.",
            )
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session.")

    return {"role": role, "applicant_id": applicant_id, "hr_id": hr_id}


def current_token(request: Optional[Request]) -> str:
    """Raw token of the current request (used by logout)."""
    return _raw_token_from_request(request, None)


# ---------------------------------------------------------------
# COOKIE HELPERS
# ---------------------------------------------------------------
def set_session_cookie(response: Response, raw_token: str) -> None:
    """Store the session as an HttpOnly cookie (not readable by JavaScript)."""
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=raw_token,
        max_age=SESSION_TTL_HOURS * 3600,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,  # type: ignore[arg-type]
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path="/",
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,  # type: ignore[arg-type]
    )


# ---------------------------------------------------------------
# FASTAPI DEPENDENCIES
# ---------------------------------------------------------------
def get_current_applicant(request: Request) -> Dict[str, Any]:
    """Authenticated applicant identity (401/403 when not an applicant)."""
    sess = resolve_session(request)
    if sess.get("role") != "applicant" or not sess.get("applicant_id"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Applicant authentication required.",
        )
    return sess


def get_current_hr(request: Request) -> Dict[str, Any]:
    """Authenticated HR identity (401/403 when not an HR user)."""
    sess = resolve_session(request)
    if sess.get("role") != "hr" or sess.get("hr_id") is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="HR authentication required."
        )
    return sess


def get_current_user(request: Request) -> Dict[str, Any]:
    """Authenticated identity of either role."""
    return resolve_session(request)


# ---------------------------------------------------------------
# IDENTITY / OWNERSHIP RESOLUTION
# ---------------------------------------------------------------
def current_applicant_id(sess: Dict[str, Any]) -> str:
    """The applicant id proven by the session (never from the request body)."""
    applicant_id = str(sess.get("applicant_id") or "")
    if not applicant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Applicant authentication required."
        )
    return applicant_id


def current_hr_id(sess: Dict[str, Any]) -> int:
    """The HR id proven by the session (never from the request body)."""
    try:
        return int(sess.get("hr_id"))
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="HR authentication required."
        )


def require_applicant_ownership(path_applicant_id: Optional[str], sess: Dict[str, Any]) -> str:
    """Allow only when a client-supplied id equals the session identity."""
    mine = current_applicant_id(sess)
    if not path_applicant_id or str(path_applicant_id) != mine:
        raise HTTPException(status_code=403, detail="Not your resource.")
    return mine


def require_hr_ownership(path_hr_id: Any, sess: Dict[str, Any]) -> int:
    """Allow only when a client-supplied hr_id equals the session identity."""
    mine = current_hr_id(sess)
    try:
        theirs = int(path_hr_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=403, detail="Not your resource.")
    if theirs != mine:
        raise HTTPException(status_code=403, detail="Not your resource.")
    return mine
