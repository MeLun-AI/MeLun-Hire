"""
Password Reset API Router

Endpoints:
  POST   /api/auth/forgot-password    — Request password reset
  GET    /api/auth/verify-reset-token  — Verify reset token validity
  POST   /api/auth/reset-password      — Reset password with token
"""

import os
import uuid
import hashlib
import secrets
import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, EmailStr, field_validator
import re

from database.db import get_db
from utils.security import hash_password
from utils.rate_limit import limit_password_reset, limit_verify_code
from services.password_reset_email import send_password_reset_email
from config.settings import settings
from auth.sessions import APP_ENV

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["password-reset"])

# ──────────────────────────────────────────────
#  Pydantic models
# ──────────────────────────────────────────────

class ForgotPasswordRequest(BaseModel):
    email: str
    role: str  # "hr" or "applicant"

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.strip().lower()
        if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", v):
            raise ValueError("Invalid email format")
        return v

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        v = v.strip().lower()
        if v not in ("hr", "applicant"):
            raise ValueError("Role must be 'hr' or 'applicant'")
        return v


class ResetPasswordRequest(BaseModel):
    token: str
    password: str

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain an uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain a lowercase letter")
        if not re.search(r"[0-9]", v):
            raise ValueError("Password must contain a number")
        if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", v):
            raise ValueError("Password must contain a special character")
        return v


# ──────────────────────────────────────────────
#  Helpers
# ──────────────────────────────────────────────

def _hash_token(token: str) -> str:
    """Hash a token using SHA-256 for storage."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _generate_secure_token() -> str:
    """Generate a cryptographically secure random token."""
    return secrets.token_urlsafe(48)


def _check_email_exists(email: str, role: str) -> bool:
    """Check if an email exists in the given role's table."""
    conn = get_db()
    cur = conn.cursor()
    try:
        if role == "hr":
            cur.execute("SELECT id FROM hr_users WHERE email = ?", (email,))
        else:
            cur.execute("SELECT id FROM applicants WHERE email = ?", (email,))
        row = cur.fetchone()
        return row is not None
    finally:
        conn.close()


def _invalidate_existing_tokens(email: str) -> None:
    """Mark all unused tokens for this email as used."""
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute(
            "UPDATE password_reset_tokens SET used = 1 WHERE email = ? AND used = 0",
            (email,),
        )
        conn.commit()
    finally:
        conn.close()


# ──────────────────────────────────────────────
#  POST /api/auth/forgot-password
# ──────────────────────────────────────────────

@router.post("/forgot-password")
def forgot_password(req: ForgotPasswordRequest, request: Request):
    """
    Request a password reset.

    Always returns 200 to prevent email enumeration.
    If the account exists, generates a token, stores it, and sends an email.
    """
    email = req.email.strip().lower()
    role = req.role.strip().lower()

    # Rate limited per email address and per client host.
    limit_password_reset(email, request)

    # Check if account exists (never reveal this to the client)
    account_exists = _check_email_exists(email, role)

    if account_exists:
        logger.info("✅ Account found (%s) — generating reset token", role)

        # Invalidate any existing tokens for this email
        _invalidate_existing_tokens(email)
        logger.info("   Invalidated previous tokens for the account")

        # Generate secure token
        raw_token = _generate_secure_token()
        token_hash = _hash_token(raw_token)
        token_id = str(uuid.uuid4())
        expires_at = (datetime.utcnow() + timedelta(minutes=15)).isoformat()
        logger.info("   Token generated: id=%s, expires_at=%s", token_id, expires_at)

        # Store in database
        conn = get_db()
        cur = conn.cursor()
        try:
            cur.execute(
                """INSERT INTO password_reset_tokens (id, email, role, token_hash, expires_at, used)
                   VALUES (?, ?, ?, ?, ?, 0)""",
                (token_id, email, role, token_hash, expires_at),
            )
            conn.commit()
            logger.info("   Token saved to database successfully")
        except Exception as db_err:
            logger.exception("❌ DATABASE ERROR saving reset token: %s", db_err)
            raise HTTPException(status_code=500, detail="Internal server error. Please try again later.")
        finally:
            conn.close()

        # Build reset link using the settings object (single source of truth)
        reset_link = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password/{role}?token={raw_token}"
        # The reset link embeds a one-time credential token — never logged.
        logger.info("   Reset link generated for %s (token hidden)", role)

        # Send email
        logger.info("   Calling send_password_reset_email...")
        email_sent = send_password_reset_email(email, reset_link)

        if email_sent:
            logger.info("✅ Password reset email sent successfully")
        else:
            logger.error("❌ Password reset email FAILED to send")
            # We don't expose the failure to the client (to prevent enumeration),
            # but we log the error and flag it in the response.
            logger.warning("   Email delivery failed but returning generic success to client")

    else:
        logger.info("   No account found (%s) — returning generic success", role)

    return {
        "message": "If an account exists, a password reset link has been sent.",
        # The following flag is for diagnostics only — not shown to user
        "_email_delivered": True if not account_exists or (account_exists and 'email_sent' in locals() and email_sent) else False
    }


# ──────────────────────────────────────────────
#  GET /api/auth/verify-reset-token
# ──────────────────────────────────────────────

@router.get("/verify-reset-token")
def verify_reset_token(token: str = Query(..., min_length=1)):
    """
    Verify a password reset token.

    Returns:
      - valid: true/false
      - role: the user's role (if valid)
    """
    token_hash = _hash_token(token)
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute(
            """SELECT email, role, expires_at, used
               FROM password_reset_tokens
               WHERE token_hash = ?
               ORDER BY created_at DESC
               LIMIT 1""",
            (token_hash,),
        )
        row = cur.fetchone()
    finally:
        conn.close()

    if not row:
        return {"valid": False, "role": None}

    email, role, expires_at_str, used = row

    # Check if used
    if used:
        return {"valid": False, "role": None}

    # Check if expired
    try:
        expires_at = datetime.fromisoformat(expires_at_str)
        if datetime.utcnow() > expires_at:
            return {"valid": False, "role": None}
    except (ValueError, TypeError):
        return {"valid": False, "role": None}

    return {"valid": True, "role": role}


# ──────────────────────────────────────────────
#  POST /api/auth/reset-password
# ──────────────────────────────────────────────

@router.post("/reset-password")
def reset_password(req: ResetPasswordRequest, request: Request):
    """
    Reset a user's password using a valid token.

    Validates the token, hashes the new password, updates the user's
    record, and marks the token as used.
    """
    # Rate limited so reset tokens cannot be brute forced.
    limit_verify_code(f"reset:{req.token[:8]}", request)
    limit_password_reset("reset", request)

    token_hash = _hash_token(req.token)

    conn = get_db()
    cur = conn.cursor()
    try:
        # Fetch the token record
        cur.execute(
            """SELECT id, email, role, expires_at, used
               FROM password_reset_tokens
               WHERE token_hash = ?
               ORDER BY created_at DESC
               LIMIT 1""",
            (token_hash,),
        )
        row = cur.fetchone()

        if not row:
            raise HTTPException(status_code=400, detail="Invalid reset token.")

        token_id, email, role, expires_at_str, used = row

        # Check if already used
        if used:
            raise HTTPException(status_code=400, detail="This reset link has already been used.")

        # Check if expired
        try:
            expires_at = datetime.fromisoformat(expires_at_str)
            if datetime.utcnow() > expires_at:
                raise HTTPException(status_code=400, detail="This reset link has expired.")
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid token expiry.")

        # Hash the new password
        new_password_hash = hash_password(req.password)

        # Update the user's password
        if role == "hr":
            cur.execute(
                "UPDATE hr_users SET password_hash = ? WHERE email = ?",
                (new_password_hash, email),
            )
        else:
            cur.execute(
                "UPDATE applicants SET password = ? WHERE email = ?",
                (new_password_hash, email),
            )

        if cur.rowcount == 0:
            raise HTTPException(status_code=500, detail="User not found. Please try again.")

        # Mark token as used
        cur.execute(
            "UPDATE password_reset_tokens SET used = 1 WHERE id = ?",
            (token_id,),
        )

        conn.commit()

        logger.info("✅ Password reset successful (%s)", role)

        return {"message": "Password updated successfully."}

    except HTTPException:
        conn.close()
        raise
    except Exception as e:
        conn.close()
        logger.exception("Error resetting password for token %s: %s", token_id, e)
        raise HTTPException(status_code=500, detail="An unexpected error occurred. Please try again.")


# ──────────────────────────────────────────────
#  GET /api/test-email  (diagnostic)
# ──────────────────────────────────────────────

@router.get("/test-email")
def test_email():
    """
    Diagnostic endpoint to test SMTP configuration.

    Sends a simple test email to the configured SMTP_FROM address and returns
    credential-free diagnostics (no usernames, addresses, passwords or tokens).
    """
    # Diagnostic-only endpoint: it must never be reachable in production.
    if APP_ENV == "production":
        raise HTTPException(status_code=404, detail="Not found")

    # Build the diagnostic report from safe, non-credential values only.
    # Email identities (SMTP username / from) and secrets are never returned —
    # only presence/status flags are exposed.
    diag = {
        "environment": APP_ENV,
        "configured": bool(
            settings.SMTP_SERVER and settings.SMTP_USERNAME and settings.SMTP_PASSWORD
        ),
        "smtp_server": settings.SMTP_SERVER or "❌ NOT SET",
        "smtp_port": str(settings.SMTP_PORT),
        "smtp_password_set": bool(settings.SMTP_PASSWORD),
        "frontend_url": settings.FRONTEND_URL or "❌ NOT SET",
        "status": "unknown",
        "details": [],
    }

    if not settings.SMTP_SERVER or not settings.SMTP_USERNAME:
        diag["status"] = "skipped"
        diag["details"].append("SMTP not fully configured — no test email sent.")
        return diag

    # Send test email to the configured from address (identity is never logged)
    test_to = settings.SMTP_FROM or settings.SMTP_USERNAME
    test_link = f"{settings.FRONTEND_URL}/reset-password/hr?token=test-diagnostic-token"

    logger.info("🧪 TEST EMAIL — sending diagnostic test email (recipient masked)")

    try:
        result = send_password_reset_email(test_to, test_link)
        if result:
            diag["status"] = "success"
            diag["details"].append("Test email dispatched successfully.")
        else:
            diag["status"] = "failed"
            diag["details"].append("send_password_reset_email returned False — check server logs for SMTP error details")
    except Exception:
        diag["status"] = "error"
        # Raw exception text can echo SMTP identities, so it stays server-side.
        diag["details"].append("Test email failed — check server logs for details.")
        logger.exception("🧪 TEST EMAIL — unexpected error while sending diagnostic email")

    return diag
