"""
Password Hashing
================
Secure password hashing using bcrypt.

TEACHING NOTE:
    NEVER store plain-text passwords. We use bcrypt which:
    1. Adds a random "salt" to each password (prevents rainbow tables)
    2. Is intentionally slow (makes brute force attacks impractical)
    3. Has a configurable "work factor" that can increase over time

    The verify function compares a plain-text password against a hash
    in constant time (prevents timing attacks).
"""

import bcrypt


def hash_password(password: str) -> str:
    """Hash a plain-text password for storage."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Check a plain-text password against a stored hash."""
    return bcrypt.checkpw(
        plain_password.encode("utf-8"),
        hashed_password.encode("utf-8"),
    )
