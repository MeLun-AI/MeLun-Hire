"""
Production-ready password reset email service.

Uses the centralised settings object from config/settings.py as the
single source of truth for SMTP configuration.

Logs detailed diagnostics on every step (credentials, email identities and
reset tokens are never logged).
NEVER swallows exceptions — always prints the exact SMTP error.
"""

import logging
import traceback
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import smtplib
import ssl

from config.settings import settings

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────
#  Startup diagnostic
# ──────────────────────────────────────────────
_smtp_configured = bool(settings.SMTP_SERVER and settings.SMTP_USERNAME)
logger.info("📧 password_reset_email.py loaded")
logger.info("   SMTP loaded from settings: %s", "YES" if _smtp_configured else "NO")
if _smtp_configured:
    logger.info("   SMTP_SERVER  = %s", settings.SMTP_SERVER)
    logger.info("   SMTP_PORT    = %s", settings.SMTP_PORT)
    # Email identities are never logged — only presence is reported.
    logger.info("   SMTP_USERNAME = %s", "****" if settings.SMTP_USERNAME else "(not set)")
    logger.info("   SMTP_FROM    = %s", "****" if settings.SMTP_FROM else "(not set)")
    logger.info("   SMTP_PASSWORD = %s", "****" if settings.SMTP_PASSWORD else "(empty)")
    logger.info("   FRONTEND_URL = %s", settings.FRONTEND_URL)
else:
    logger.warning("   SMTP not configured — will use stub mode")

# ──────────────────────────────────────────────
#  HTML email template
# ──────────────────────────────────────────────

RESET_EMAIL_TEMPLATE = """\
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0a1a;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="background-color:#0a0a1a;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%%;">
          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <span style="color:#ff6b4a;font-size:20px;font-weight:800;letter-spacing:0.15em;text-transform:uppercase;">MeLun Hire</span>
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td style="background:#111125;border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:40px 32px;">
              <!-- Heading -->
              <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#ffffff;text-align:center;">
                Reset Your MeLun Hire Password
              </h1>
              <!-- Body -->
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#9ca3af;text-align:center;">
                Hello,<br><br>
                We received a request to reset your password for your MeLun Hire account.
                Click the secure button below to create a new password.
              </p>
              <!-- Button -->
              <table role="presentation" width="100%%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-bottom:24px;">
                    <a href="{reset_link}"
                       style="display:inline-block;background:#2563eb;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 36px;border-radius:12px;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>
              <!-- Note -->
              <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#6b7280;text-align:center;">
                If you didn't request this, you can safely ignore this email.<br>
                This link expires in <strong style="color:#9ca3af;">15 minutes</strong>.
              </p>
              <!-- Divider -->
              <div style="height:1px;background:rgba(255,255,255,0.05);margin:24px 0;"></div>
              <!-- Footer -->
              <p style="margin:0;font-size:12px;color:#4b5563;text-align:center;">
                MeLun Hire &bull; Powered by MeLun
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""


def send_password_reset_email(to_email: str, reset_link: str) -> bool:
    """
    Send a password reset email with the given reset link.

    Uses settings from config/settings.py (single source of truth).
    Logs EVERY step. NEVER swallows exceptions — prints the exact
    SMTP error with full traceback.
    """
    print("=" * 80, flush=True)
    print("📧 send_password_reset_email() CALLED", flush=True)
    # Recipient address is PII and the reset link carries a one-time credential
    # token — neither is ever written to logs.
    print("   To: ****", flush=True)
    print("   Link: **** (reset token hidden)", flush=True)
    print("=" * 80, flush=True)

    # Log config from settings (identities/credentials are masked)
    print(f"   SMTP_SERVER  = {settings.SMTP_SERVER or '(not set)'}", flush=True)
    print(f"   SMTP_PORT    = {settings.SMTP_PORT}", flush=True)
    print(f"   SMTP_USERNAME = {'****' if settings.SMTP_USERNAME else '(not set)'}", flush=True)
    print(f"   SMTP_FROM    = {'****' if settings.SMTP_FROM else '(not set)'}", flush=True)
    print(f"   SMTP_PASSWORD = {'****' if settings.SMTP_PASSWORD else '(not set)'}", flush=True)

    # ── If SMTP is not configured, use stub ────────────────────
    if not settings.SMTP_SERVER or not settings.SMTP_USERNAME:
        print("⚠️  SMTP NOT CONFIGURED — using stub", flush=True)
        print("📧 STUB — password reset email not sent (recipient masked)", flush=True)
        print("=" * 80, flush=True)
        return True

    # ── Build email ────────────────────────────────────────────
    subject = "Reset Your MeLun Hire Password"
    smtp_port = settings.SMTP_PORT
    from_addr = settings.SMTP_FROM or settings.SMTP_USERNAME

    html_body = RESET_EMAIL_TEMPLATE.format(reset_link=reset_link)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_email
    msg.attach(MIMEText(html_body, "html"))

    # ── Send with FULL debugging ──────────────────────────────
    server = None
    try:
        print(f"🔌 STEP 1: Connecting to {settings.SMTP_SERVER}:{smtp_port}...", flush=True)
        server = smtplib.SMTP(settings.SMTP_SERVER, smtp_port, timeout=15)
        # Debug level 0 — level 1 dumps every SMTP byte, including the base64
        # AUTH credentials and the message body (which carries the reset token).
        server.set_debuglevel(0)
        print("✅ STEP 1: Connected successfully", flush=True)

        print("🔒 STEP 2: Starting TLS...", flush=True)
        server.starttls()
        print("✅ STEP 2: TLS started successfully", flush=True)

        # Sanitize credentials before login
        smtp_username = settings.SMTP_USERNAME.strip()
        smtp_password = settings.SMTP_PASSWORD.replace(" ", "").strip()
        print(f"🔑 STEP 3: Logging in...", flush=True)
        print(f"   Using SMTP_PASSWORD from settings: YES", flush=True)
        print(f"   Username: {'****' if smtp_username else '(empty)'}", flush=True)
        print(f"   Password: {'****' if smtp_password else '(empty)'}", flush=True)
        print(f"   NOT using: SENDER_PASSWORD, os.getenv(), or hardcoded value", flush=True)
        server.login(smtp_username, smtp_password)
        print("✅ STEP 3: Login successful", flush=True)

        print("📤 STEP 4: Sending email...", flush=True)
        server.send_message(msg)
        print("✅ STEP 4: Email sent successfully", flush=True)

        server.quit()
        print("✅ EMAIL SENT SUCCESSFULLY (recipient masked)", flush=True)
        print("=" * 80, flush=True)
        return True

    except smtplib.SMTPAuthenticationError as e:
        print("=" * 80, flush=True)
        print("❌❌❌ SMTP AUTHENTICATION FAILED ❌❌❌", flush=True)
        print(f"   Exception type: {type(e).__name__}", flush=True)
        print(f"   Exception args: {e.args}", flush=True)
        print(f"   SMTP code: {e.smtp_code if hasattr(e, 'smtp_code') else 'N/A'}", flush=True)
        print(f"   SMTP error: {e.smtp_error if hasattr(e, 'smtp_error') else 'N/A'}", flush=True)
        print("   Username: **** (masked)", flush=True)
        print("   Possible causes:", flush=True)
        print("   - Wrong SMTP_PASSWORD in .env", flush=True)
        print("   - Gmail requires an App Password (not regular password)", flush=True)
        print("   - 2FA is enabled on the account", flush=True)
        print("   - Less secure app access is blocked", flush=True)
        traceback.print_exc()
        print("=" * 80, flush=True)
        raise  # ← DO NOT SWALLOW

    except smtplib.SMTPConnectError as e:
        print("=" * 80, flush=True)
        print("❌❌❌ SMTP CONNECTION FAILED ❌❌❌", flush=True)
        print(f"   Exception type: {type(e).__name__}", flush=True)
        print(f"   Exception args: {e.args}", flush=True)
        print(f"   Server: {settings.SMTP_SERVER}:{smtp_port}", flush=True)
        traceback.print_exc()
        print("=" * 80, flush=True)
        raise

    except smtplib.SMTPServerDisconnected as e:
        print("=" * 80, flush=True)
        print("❌❌❌ SMTP SERVER DISCONNECTED ❌❌❌", flush=True)
        print(f"   Exception type: {type(e).__name__}", flush=True)
        print(f"   Exception args: {e.args}", flush=True)
        traceback.print_exc()
        print("=" * 80, flush=True)
        raise

    except smtplib.SMTPException as e:
        print("=" * 80, flush=True)
        print("❌❌❌ SMTP EXCEPTION ❌❌❌", flush=True)
        print(f"   Exception type: {type(e).__name__}", flush=True)
        print(f"   Exception args: {e.args}", flush=True)
        traceback.print_exc()
        print("=" * 80, flush=True)
        raise

    except TimeoutError as e:
        print("=" * 80, flush=True)
        print("❌❌❌ SMTP TIMEOUT ❌❌❌", flush=True)
        print(f"   Exception type: {type(e).__name__}", flush=True)
        print(f"   Exception args: {e.args}", flush=True)
        print(f"   Server: {settings.SMTP_SERVER}:{smtp_port}", flush=True)
        traceback.print_exc()
        print("=" * 80, flush=True)
        raise

    except ssl.SSLError as e:
        print("=" * 80, flush=True)
        print("❌❌❌ SSL ERROR ❌❌❌", flush=True)
        print(f"   Exception type: {type(e).__name__}", flush=True)
        print(f"   Exception args: {e.args}", flush=True)
        traceback.print_exc()
        print("=" * 80, flush=True)
        raise

    except Exception as e:
        print("=" * 80, flush=True)
        print("❌❌❌ UNEXPECTED EMAIL ERROR ❌❌❌", flush=True)
        print(f"   Exception type: {type(e).__name__}", flush=True)
        print(f"   Exception args: {e.args}", flush=True)
        traceback.print_exc()
        print("=" * 80, flush=True)
        raise

    finally:
        if server is not None:
            try:
                server.quit()
            except Exception:
                pass