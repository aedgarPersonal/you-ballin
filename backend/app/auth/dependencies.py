"""
Authentication Dependencies
============================
FastAPI dependencies for protecting routes.

TEACHING NOTE:
    FastAPI's dependency injection system lets us declare auth requirements
    declaratively. A route that needs authentication simply adds:

        async def my_route(user: User = Depends(get_current_user)):

    FastAPI automatically:
    1. Extracts the Bearer token from the Authorization header
    2. Calls get_current_user() to validate it
    3. Passes the User object to the route handler
    4. Returns 401 if the token is invalid

    For admin-only routes, use `get_current_admin` which adds a role check.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import verify_access_token
from app.database import get_db
from app.models.user import User, UserRole

# This tells FastAPI to expect a Bearer token in the Authorization header
security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Extract and validate the current user from the JWT token.

    Raises:
        HTTPException 401: If the token is missing, invalid, or expired.
        HTTPException 401: If the user doesn't exist or is deactivated.
    """
    token = credentials.credentials
    user_id = verify_access_token(token)

    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or deactivated",
        )

    return user


async def get_current_admin(
    user: User = Depends(get_current_user),
) -> User:
    """Ensure the current user has admin privileges.

    TEACHING NOTE:
        This dependency *chains* on get_current_user. FastAPI resolves
        dependencies recursively, so get_current_user runs first, then
        this function checks the role.

    Raises:
        HTTPException 403: If the user is not an admin.
    """
    if user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user
