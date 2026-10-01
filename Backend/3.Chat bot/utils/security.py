from passlib.context import CryptContext

pwd_context = CryptContext(
    schemes=["argon2"],
    deprecated="auto"
)

def hash_password(password: str):
    return pwd_context.hash(password)

def verify_password(password: str, hashed: str):
    return pwd_context.verify(password, hashed)

def password_matches(password: str, stored_hash) -> bool:
    """Fail-closed password check.

    Returns False (instead of raising) for missing/unknown hash formats so a
    legacy or corrupted row can never turn a failed login into a server error.
    """
    if not stored_hash:
        return False
    try:
        return bool(verify_password(password or "", str(stored_hash)))
    except Exception:
        return False
