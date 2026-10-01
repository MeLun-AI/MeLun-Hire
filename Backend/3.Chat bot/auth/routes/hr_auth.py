from fastapi import APIRouter, HTTPException, status, Request, Response
from fastapi.responses import JSONResponse
from utils.security import hash_password, password_matches
from utils.rate_limit import limit_login
from database.db import get_db
from auth.sessions import create_session, revoke_session, set_session_cookie, clear_session_cookie, current_token

router = APIRouter(prefix="/hr", tags=["HR Auth"])

# =================================================
# HR SIGNUP
# =================================================
@router.post("/signup")
def hr_signup(payload: dict):
    email = str(payload.get("email") or "").strip().lower()
    password = str(payload.get("password") or "")
    company_name = str(payload.get("company_name") or "").strip()
    hr_name = str(payload.get("hr_name") or "").strip()

    if not email or not password or not company_name or not hr_name:
        raise HTTPException(status_code=400, detail="Please fill in all required fields.")
    if len(password) < 8:
        raise HTTPException(
            status_code=400, detail="Password must be at least 8 characters."
        )

    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id FROM hr_users WHERE email = ?", (email,))
        if cur.fetchone():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered",
            )

        password_hash = hash_password(password)

        cur.execute("""
            INSERT INTO hr_users (company_name, hr_name, email, password_hash)
            VALUES (?, ?, ?, ?)
        """, (company_name, hr_name, email, password_hash))
        conn.commit()
    finally:
        conn.close()

    return {"success": True}

# =================================================
# HR LOGIN
# =================================================
@router.post("/login")
def hr_login(payload: dict, request: Request):
    email = str(payload.get("email") or "").strip().lower()
    password = str(payload.get("password") or "")

    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password are required.")

    # Brute-force protection (per account and per client host).
    limit_login(email, request)

    conn = get_db()
    cur = conn.cursor()

    cur.execute("""
        SELECT id, hr_name, company_name, password_hash, is_active
        FROM hr_users WHERE email = ?
    """, (email,))

    row = cur.fetchone()
    conn.close()

    # Same generic message for unknown email and wrong password so account
    # existence is not disclosed.
    if not row or not password_matches(password, row["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    # The is_active column is created by the HR settings migration; treat a
    # missing column as "active" for older databases.
    keys = row.keys()
    is_active = row["is_active"] if "is_active" in keys else 1
    if is_active is not None and int(is_active) == 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated.",
        )

    session = create_session(role="hr", hr_id=int(row["id"]))

    # The token is handed back for API clients (unchanged contract) and stored
    # as an HttpOnly cookie so the browser never persists it in JS storage.
    response = JSONResponse(
        {
            "success": True,
            "hr_id": row["id"],
            "hr_name": row["hr_name"],
            "company_name": row["company_name"],
            "auth_token": session["auth_token"],
            "expires_at": session["expires_at"],
        }
    )
    set_session_cookie(response, session["auth_token"])
    return response


@router.post("/logout")
def hr_logout(request: Request, response: Response):
    """Revoke the caller's session and clear the HttpOnly session cookie."""
    raw = current_token(request)
    if raw:
        revoke_session(raw)
    clear_session_cookie(response)
    return {"success": True}
