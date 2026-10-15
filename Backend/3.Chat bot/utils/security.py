from passlib.context import CryptContext
import unicodedata


def normalize_password(password: str) -> str:
    """Canonical password form shared by signup, login and password reset.

    Mobile keyboards (Android Gboard / iOS) silently emit byte-different text
    for visually identical passwords: NFD-composed accents, curly quotes from
    smart punctuation, and full-width characters. Argon2 hashes raw bytes, so
    without this step a password stored from one keyboard can never verify
    from another keyboard on another device. NFC normalisation maps those
    variants to one canonical byte string on BOTH paths, making every account
    device-portable. Non-string input becomes "" (fail-closed downstream).
    """
    if not isinstance(password, str):
        return ""
    return unicodedata.normalize("NFC", password)


pwd_context = CryptContext(
    schemes=["argon2"],
    deprecated="auto"
)

def hash_password(password: str):
    return pwd_context.hash(normalize_password(password))

def verify_password(password: str, hashed: str):
    return pwd_context.verify(normalize_password(password), hashed)

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
