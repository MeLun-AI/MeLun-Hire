"""Candidate decision emails (selection / rejection).

Uses the existing SMTP configuration from ``config/settings.py`` - the same
single source of truth the password-reset email service uses. Nothing here is
hardcoded: server, port, sender and password all come from the environment
(``.env``). The candidate address always comes from the database row, never
from recruiters typing it in.

The emails are formal, contain no internal scoring or AI details, and the
transport never raises: the caller records whether the send succeeded so the
decision itself is never lost.
"""
from __future__ import annotations

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from config.settings import settings
from services.final_decision import DECISION_SELECTED

logger = logging.getLogger(__name__)

BRAND = "MeLun Hire"


def _plain_text(decision: str, candidate_name: str, job_title: str, company_name: str) -> str:
    greeting = f"Dear {candidate_name}," if candidate_name else "Dear Candidate,"
    role = job_title or "the position you applied for"
    company = company_name or "our company"

    if decision == DECISION_SELECTED:
        return (
            f"{greeting}\n\n"
            f"We are pleased to inform you that you have been selected for the "
            f"position of {role} at {company}.\n\n"
            "Congratulations on the outcome of your application. Our team will "
            "contact you shortly with the next steps and the details required to "
            "complete your onboarding.\n\n"
            "If you have any questions in the meantime, please reply to this email.\n\n"
            f"Sincerely,\n{BRAND} Recruitment Team\non behalf of {company}\n"
        )

    return (
        f"{greeting}\n\n"
        f"Thank you for taking the time to apply for the position of {role} at "
        f"{company} and for completing your interview with us.\n\n"
        "After careful consideration, we have decided not to move forward with your "
        "application at this time. This decision was not easy and does not diminish "
        "the value of your skills and experience.\n\n"
        "We would be glad to stay in touch and encourage you to apply for future "
        "openings that match your profile.\n\n"
        "We wish you every success in your career.\n\n"
        f"Sincerely,\n{BRAND} Recruitment Team\non behalf of {company}\n"
    )


def _html_body(
    decision: str,
    candidate_name: str,
    job_title: str,
    company_name: str,
) -> str:
    greeting = f"Dear {candidate_name}," if candidate_name else "Dear Candidate,"
    role = job_title or "the position you applied for"
    company = company_name or "our company"

    if decision == DECISION_SELECTED:
        heading = "Congratulations - You Have Been Selected"
        paragraphs = [
            f"We are pleased to inform you that you have been selected for the "
            f"position of <strong>{role}</strong> at <strong>{company}</strong>.",
            "Our team will contact you shortly with the next steps and the details "
            "required to complete your onboarding.",
            "If you have any questions in the meantime, please reply to this email.",
        ]
    else:
        heading = "Update on Your Application"
        paragraphs = [
            f"Thank you for taking the time to apply for the position of "
            f"<strong>{role}</strong> at <strong>{company}</strong> and for "
            "completing your interview with us.",
            "After careful consideration, we have decided not to move forward with "
            "your application at this time. This decision was not easy and does not "
            "diminish the value of your skills and experience.",
            "We would be glad to stay in touch and encourage you to apply for future "
            "openings that match your profile.",
        ]

    body_html = "".join(
        f'<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">{p}</p>'
        for p in paragraphs
    )
    closing = (
        "We wish you every success in your career."
        if decision != DECISION_SELECTED
        else "Welcome aboard!"
    )

    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>{heading}</title></head>
<body style="margin:0;padding:24px;background-color:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;">
    <tr>
      <td style="padding:28px 32px 8px;">
        <span style="color:#ff6b4a;font-size:15px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;">{BRAND}</span>
      </td>
    </tr>
    <tr>
      <td style="padding:0 32px 28px;">
        <h1 style="margin:12px 0 20px;font-size:20px;color:#111827;">{heading}</h1>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">{greeting}</p>
        {body_html}
        <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#374151;">{closing}</p>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#374151;">
          Sincerely,<br>{BRAND} Recruitment Team<br>on behalf of {company}
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 32px;border-top:1px solid #e5e7eb;">
        <p style="margin:0;font-size:12px;color:#9ca3af;">This is an automated message from {BRAND}. Please do not reply to this address if you were asked to use another contact.</p>
      </td>
    </tr>
  </table>
</body>
</html>"""



def _send(to_email: str, subject: str, text_body: str, html_body: str) -> bool:
    """Send one multipart email through the configured SMTP server.

    Returns True only when the server accepted the message. The exact SMTP
    error is logged (never returned to a user).
    """
    if not settings.SMTP_SERVER or not settings.SMTP_USERNAME:
        logger.error("SMTP is not configured; decision email was not sent.")
        return False
    if not settings.SMTP_PASSWORD:
        logger.error("SMTP password is not configured; decision email was not sent.")
        return False

    from_addr = settings.SMTP_FROM or settings.SMTP_USERNAME

    message = MIMEMultipart("alternative")
    message["Subject"] = subject
    message["From"] = from_addr
    message["To"] = to_email
    message.attach(MIMEText(text_body, "plain", "utf-8"))
    message.attach(MIMEText(html_body, "html", "utf-8"))

    try:
        server = smtplib.SMTP(settings.SMTP_SERVER, settings.SMTP_PORT, timeout=15)
        try:
            server.starttls()
            server.login(settings.SMTP_USERNAME.strip(), settings.SMTP_PASSWORD)
            server.send_message(message)
        finally:
            try:
                server.quit()
            except Exception:
                pass
    except smtplib.SMTPException:
        logger.exception("SMTP error while sending a decision email")
        return False
    except Exception:
        logger.exception("Unexpected error while sending a decision email")
        return False

    return True


def decision_email_subject(decision: str, job_title: str, company_name: str) -> str:
    role = job_title or "the position you applied for"
    if decision == DECISION_SELECTED:
        return f"Congratulations - You have been selected for {role}"
    return f"Update on your application for {role}"


def send_decision_email(
    *,
    decision: str,
    to_email: str,
    candidate_name: str = "",
    job_title: str = "",
    company_name: str = "",
) -> bool:
    """Send the formal selection / rejection email to the candidate.

    ``decision`` must be ``'selected'`` or ``'rejected'``. The recipient is the
    address stored on the candidate's account (never typed by a recruiter).
    """
    if not to_email:
        logger.error("Decision email skipped: the candidate has no email address.")
        return False

    subject = decision_email_subject(decision, job_title, company_name)
    text_body = _plain_text(decision, candidate_name, job_title, company_name)
    html_body = _html_body(decision, candidate_name, job_title, company_name)

    sent = _send(to_email, subject, text_body, html_body)
    if sent:
        logger.info("Decision email (%s) delivered.", decision)
    else:
        logger.warning("Decision email (%s) could not be delivered.", decision)
    return sent
