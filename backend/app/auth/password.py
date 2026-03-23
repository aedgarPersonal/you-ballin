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

from passlib.context import CryptContext

# bcrypt is the recommended algorithm for password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Hash a plain-text password for storage."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Check a plain-text password against a stored hash."""
    return pwd_context.verify(plain_password, hashed_password)
