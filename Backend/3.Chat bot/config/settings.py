import os
import secrets
import sys
from pathlib import Path
from dotenv import load_dotenv
from pydantic_settings import BaseSettings

# ──────────────────────────────────────────────
#  Force-load .env from the backend root directory
#  using an absolute path so it works regardless
#  of the current working directory.
# ──────────────────────────────────────────────
BACKEND_DIR = Path(__file__).resolve().parent.parent  # Backend/3.Chat bot/
DOTENV_PATH = BACKEND_DIR / ".env"

if DOTENV_PATH.exists():
    load_dotenv(DOTENV_PATH, override=True)
    print(f"✅ Loaded .env from: {DOTENV_PATH}", flush=True)
else:
    print(f"❌ .env NOT FOUND at: {DOTENV_PATH}", flush=True)
    print(f"   CWD: {Path.cwd()}", flush=True)

# ──────────────────────────────────────────────
#  Startup diagnostics — print key env vars
# ──────────────────────────────────────────────
print("=" * 50, flush=True)
print("🔍 ENV VAR DIAGNOSTICS", flush=True)
print("=" * 50, flush=True)

env_checks = [
    "SMTP_SERVER",
    "SMTP_PORT",
    "SMTP_USERNAME",
    "SMTP_PASSWORD",
    "SMTP_FROM",
    "SENDER_EMAIL",
    "SENDER_PASSWORD",
    "FRONTEND_URL",
    "SECRET_KEY",
]

# Values that must never be echoed to logs. This covers secrets/passwords as
# well as the email identities (SMTP login, sender and from address). Presence
# is still reported so the diagnostic stays useful without leaking anything.
MASKED_ENV_KEYS = {
    "SMTP_USERNAME",
    "SMTP_PASSWORD",
    "SMTP_FROM",
    "SENDER_EMAIL",
    "SENDER_PASSWORD",
    "SECRET_KEY",
}

all_ok = True
for key in env_checks:
    val = os.getenv(key, "")
    if val:
        display = "****" if key in MASKED_ENV_KEYS else val
        print(f"   ✅ {key} = {display}", flush=True)
    else:
        print(f"   ❌ {key} = NOT SET", flush=True)
        all_ok = False

if all_ok:
    print("✅ All environment variables loaded successfully.", flush=True)
else:
    print("⚠️  Some environment variables are missing.", flush=True)

print("=" * 50, flush=True)


class Settings(BaseSettings):
    """Global configuration for the MeLun Hire platform"""

    # =========================
    # App & Database
    # =========================
    APP_NAME: str = "MeLun Hire"
    # NOTE: the SQLite file name is intentionally unchanged — existing data,
    # backups and local deployments reference it. It is not public branding.
    DATABASE_URL: str = "sqlite:///./quno_hr.db"

    # =========================
    # LLM Configuration
    # =========================
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    LLM_MODEL: str = os.getenv("LLM_MODEL", "gpt-4o-mini")
    LLM_TEMPERATURE: float = float(os.getenv("LLM_TEMPERATURE", 0.7))
    LLM_MAX_TOKENS: int = int(os.getenv("LLM_MAX_TOKENS", 2000))

    # =========================
    # Interview Configuration
    # =========================
    INTERVIEW_ROUNDS: int = int(os.getenv("INTERVIEW_ROUNDS", 3))
    INTERVIEW_QUESTIONS_PER_ROUND: int = int(
        os.getenv("INTERVIEW_QUESTIONS_PER_ROUND", 3)
    )
    INTERVIEW_TIME_LIMIT: int = int(os.getenv("INTERVIEW_TIME_LIMIT", 60))  # seconds

    # =========================
    # Group Discussion (GD)
    # =========================
    GD_DURATION: int = int(os.getenv("GD_DURATION", 300))  # seconds
    GD_MIN_PARTICIPANTS: int = int(os.getenv("GD_MIN_PARTICIPANTS", 1))

    # =========================
    # Scoring Weights
    # =========================
    RESUME_WEIGHT: float = float(os.getenv("RESUME_WEIGHT", 0.25))
    TECHNICAL_WEIGHT: float = float(os.getenv("TECHNICAL_WEIGHT", 0.30))
    BEHAVIORAL_WEIGHT: float = float(os.getenv("BEHAVIORAL_WEIGHT", 0.20))
    GD_WEIGHT: float = float(os.getenv("GD_WEIGHT", 0.25))

    # =========================
    # Thresholds
    # =========================
    RESUME_PASS_THRESHOLD: float = float(os.getenv("RESUME_PASS_THRESHOLD", 60))
    FINAL_PASS_THRESHOLD: float = float(os.getenv("FINAL_PASS_THRESHOLD", 70))

    # =========================
    # Reports / Output
    # =========================
    OUTPUT_FORMAT: str = os.getenv("OUTPUT_FORMAT", "json")
    SAVE_REPORTS: bool = os.getenv("SAVE_REPORTS", "true").lower() == "true"
    REPORTS_DIR: str = os.getenv("REPORTS_DIR", "./reports")

    # =========================
    # Security
    # =========================
    TOKEN_EXPIRY_HOURS: int = int(os.getenv("TOKEN_EXPIRY_HOURS", 24))
    TOKEN_LENGTH: int = int(os.getenv("TOKEN_LENGTH", 32))
    # No insecure default. A SECRET_KEY must be supplied via the environment or
    # .env; production refuses to start without it (validated after the class).
    SECRET_KEY: str = os.getenv("SECRET_KEY", "")

    # Deployment value — overridden by INTERVIEW_BASE_URL in .env.
    INTERVIEW_BASE_URL: str = os.getenv(
        "INTERVIEW_BASE_URL",
        "https://melun.ai/interview"
    )

    # =========================
    # Email (Optional)
    # =========================
    SMTP_SERVER: str = os.getenv("SMTP_SERVER", "smtp.gmail.com")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", 587))
    SMTP_USERNAME: str = os.getenv("SMTP_USERNAME", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    SMTP_FROM: str = os.getenv("SMTP_FROM", "")
    SENDER_EMAIL: str = os.getenv("SENDER_EMAIL", "")
    SENDER_PASSWORD: str = os.getenv("SENDER_PASSWORD", "")
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173")

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "allow"


# ✅ Single global settings object
settings = Settings()


# ──────────────────────────────────────────────
#  SECRET_KEY safety check
# ──────────────────────────────────────────────
# Never silently fall back to a known/committed default. In production a
# missing SECRET_KEY is a hard, explicit failure; in development an ephemeral
# key is generated so local runs still work (it is never a known value and is
# not persisted across restarts).
if not settings.SECRET_KEY:
    if os.getenv("APP_ENV", "").strip().lower() == "production":
        raise RuntimeError(
            "SECRET_KEY is not set. Refusing to start in production with an "
            "empty/known default. Set SECRET_KEY in the environment or .env."
        )
    settings.SECRET_KEY = secrets.token_urlsafe(48)
    print(
        "⚠️  SECRET_KEY not set — generated an ephemeral development key "
        "(do not use this in production).",
        flush=True,
    )