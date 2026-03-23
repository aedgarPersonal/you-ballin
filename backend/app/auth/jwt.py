"""
JWT Token Management
====================
Handles creation and validation of JSON Web Tokens.

TEACHING NOTE:
    JWTs are stateless authentication tokens. The server signs a token
    containing the user's ID, and the client sends it with every request.
    The server can verify the token without hitting the database, making
    auth checks very fast.

    Structure of our JWT payload:
    {
        "sub": "42",        # User ID (subject)
        "exp": 1700000000,  # Expiration timestamp
        "iat": 1699996400   # Issued-at timestamp
    }
"""

from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt

from app.config import settings


def create_access_token(user_id: int, expires_delta: timedelta | None = None) -> str:
    """Create a signed JWT for the given user.

    Args:
        user_id: The user's database ID.
        expires_delta: Custom expiration time. Defaults to config value.

    Returns:
        Encoded JWT string.
    """
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=settings.access_token_expire_minutes))

    payload = {
        "sub": str(user_id),
        "exp": expire,
        "iat": now,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def verify_access_token(token: str) -> int | None:
    """Verify a JWT and extract the user ID.

    Returns:
        The user ID if the token is valid, None otherwise.

    TEACHING NOTE:
        Common failure reasons:
        - Token expired (exp < now)
        - Token tampered with (signature doesn't match)
        - Token malformed (not valid base64/JSON)
    """
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
        user_id = payload.get("sub")
        if user_id is None:
            return None
        return int(user_id)
    except (JWTError, ValueError):
        return None


def create_magic_link_token(email: str) -> str:
    """Create a short-lived token for magic link authentication.

    TEACHING NOTE:
        Magic links use the same JWT mechanism but with a shorter expiry
        (15 minutes) and the email as the subject instead of user ID.
        This is sent via email - clicking the link logs the user in.
    """
    now = datetime.now(timezone.utc)
    payload = {
        "sub": email,
        "exp": now + timedelta(minutes=15),
        "iat": now,
        "type": "magic_link",
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def verify_magic_link_token(token: str) -> str | None:
    """Verify a magic link token and extract the email.

    Returns:
        The email if valid, None otherwise.
    """
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
        if payload.get("type") != "magic_link":
            return None
        return payload.get("sub")
    except (JWTError, ValueError):
        return None
