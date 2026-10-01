from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
import os
import re
import json
import sqlite3
from datetime import datetime

from services.resume_parser import extract_resume_text, analyze_resume
from auth.sessions import get_current_applicant, require_applicant_ownership
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/applicant", tags=["Applicant"])

# ------------------------------------------------------------------
# Paths (resolved from the backend root so they work regardless of CWD)
# ------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOAD_DIR = os.path.join(BASE_DIR, "data", "resumes")
DB_PATH = os.path.join(BASE_DIR, "database", "database.db")
ALLOWED_EXTENSIONS = {".pdf", ".docx"}

# Upload hardening: hard size cap + content sniffing so a renamed file cannot
# smuggle an unexpected payload into the resume store.
MAX_RESUME_BYTES = 5 * 1024 * 1024
_RESUME_MAGIC = {
    ".pdf": (b"%PDF-",),
    ".docx": (b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08"),
}

os.makedirs(UPLOAD_DIR, exist_ok=True)



def get_conn():
    """Robust connection (WAL + busy timeout) matching the other routers."""
    conn = sqlite3.connect(
        DB_PATH,
        timeout=30,
        check_same_thread=False,
        isolation_level=None,
    )
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA busy_timeout=30000;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    return conn


def _safe_applicant_dir(applicant_id: str) -> str:
    safe_id = re.sub(r"[^A-Za-z0-9_-]", "", applicant_id or "")
    directory = os.path.join(UPLOAD_DIR, safe_id)
    os.makedirs(directory, exist_ok=True)
    return directory


def _safe_stored_name(filename: str) -> str:
    """Strip directories and unsafe characters from a client file name.

    Prevents path traversal (``../../x.pdf``) and keeps the stored name inside
    the applicant's own upload folder.
    """
    base = os.path.basename((filename or "").replace("\\", "/")).strip()
    base = re.sub(r"[^A-Za-z0-9._-]", "_", base)
    base = base.lstrip(".") or "resume"
    return base[:120]


def _looks_like(ext: str, data: bytes) -> bool:
    """True when the bytes match the expected magic numbers for the extension."""
    signatures = _RESUME_MAGIC.get(ext)
    if not signatures:
        return False
    return any(data.startswith(sig) for sig in signatures)



def _load_profile_skills(applicant_id: str) -> list:
    """Manually entered profile skills — used as extra real skill signals."""
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT skills FROM applicants WHERE id = ?", (applicant_id,))
        row = cur.fetchone()
        conn.close()
        if not row or not row[0]:
            return []
        return [s.strip() for s in str(row[0]).replace(";", ",").split(",") if s.strip()]
    except Exception:
        return []


# ============================
# APPLICANT → UPLOAD RESUME
# ============================
@router.post("/upload-resume")
async def upload_resume(
    applicant_id: str = Form(...),
    file: UploadFile = File(...),
    sess: dict = Depends(get_current_applicant),
):
    # Authorization: a resume can only be uploaded to the caller's own record.
    applicant_id = require_applicant_ownership(applicant_id, sess)

    filename = _safe_stored_name(file.filename or "")
    ext = os.path.splitext(filename)[1].lower()

    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Unsupported resume format. Please upload a PDF (.pdf) or Word (.docx) file.",
        )

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(data) > MAX_RESUME_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"Resume is too large. Maximum size is {MAX_RESUME_BYTES // (1024 * 1024)} MB.",
        )
    if not _looks_like(ext, data):
        raise HTTPException(
            status_code=400,
            detail="The file content does not match its extension. Please upload a valid PDF or DOCX resume.",
        )

    applicant_dir = _safe_applicant_dir(applicant_id)
    stored_name = f"{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{filename}"
    file_path = os.path.join(applicant_dir, stored_name)

    # Defense in depth: never write outside the applicant's own folder.
    if os.path.commonpath([os.path.abspath(file_path), os.path.abspath(applicant_dir)]) != os.path.abspath(applicant_dir):
        raise HTTPException(status_code=400, detail="Invalid file name.")

    # Parse first: a file we cannot read is rejected instead of being stored.
    try:
        text = extract_resume_text(filename, data)
    except Exception:
        logger.exception("Resume parsing failed for applicant_id=%s", applicant_id)
        raise HTTPException(
            status_code=400,
            detail="We could not read that resume. Please upload a readable PDF or DOCX file.",
        )

    with open(file_path, "wb") as f:
        f.write(data)

    # Analyse the uploaded resume against the applicant's real profile skills.
    profile_skills = _load_profile_skills(applicant_id)
    analysis = analyze_resume(text, profile_skills)


    record = {
        "applicant_id": applicant_id,
        "filename": filename,
        "stored_name": stored_name,
        "score": analysis["score"],
        "subscores": analysis["subscores"],
        "skills": analysis["skills"],
        "suggestions": analysis["suggestions"],
        "resume_text": text,
        "created_at": datetime.utcnow().isoformat() + "Z",
    }

    with open(os.path.join(applicant_dir, "analysis.json"), "w", encoding="utf-8") as f:
        json.dump(record, f, ensure_ascii=False, indent=2)

    return {"status": "uploaded", **record}


# ============================
# APPLICANT → GET RESUME ANALYSIS
# ============================
@router.get("/resume/{applicant_id}")
def get_applicant_resume(applicant_id: str, sess: dict = Depends(get_current_applicant)):
    # Authorization: resume analysis is private to the owning applicant.
    applicant_id = require_applicant_ownership(applicant_id, sess)
    safe_id = re.sub(r"[^A-Za-z0-9_-]", "", applicant_id or "")
    analysis_path = os.path.join(UPLOAD_DIR, safe_id, "analysis.json")
    if not os.path.exists(analysis_path):
        return {}
    with open(analysis_path, "r", encoding="utf-8") as f:
        return json.load(f)

