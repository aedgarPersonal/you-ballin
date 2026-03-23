"""
Authentication Dependencies
============================
FastAPI dependencies for protecting routes.

Includes:
    - get_current_user: Validates JWT and returns the User object.
    - get_current_super_admin: Ensures the user is a SUPER_ADMIN.
    - get_current_admin: Alias for get_current_super_admin (backward compat).
    - require_run_admin(): Factory for run-level admin authorization.
    - require_run_member(): Factory for run-level membership authorization.
"""

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import verify_access_token
from app.database import get_db
from app.models.run import RunAdmin, RunMembership
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


async def get_current_super_admin(
    user: User = Depends(get_current_user),
) -> User:
    """Ensure the current user is a SUPER_ADMIN.

    Raises:
        HTTPException 403: If the user is not a super admin.
    """
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super admin access required",
        )
    return user


async def get_current_admin(
    user: User = Depends(get_current_user),
) -> User:
    """Ensure the current user has admin privileges (SUPER_ADMIN only).

    This is kept for backward compatibility. For run-level admin checks,
    use require_run_admin() instead.

    Raises:
        HTTPException 403: If the user is not a super admin.
    """
    if user.role not in (UserRole.SUPER_ADMIN,):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user


def require_run_admin(run_id_param: str = "run_id"):
    """Factory that returns a dependency checking run-level admin access.

    Allows access if the user is a SUPER_ADMIN or is listed in the
    run_admins table for the given run.

    Args:
        run_id_param: Name of the path parameter containing the run ID.
    """

    async def dependency(
        request: Request,
        user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> User:
        run_id = request.path_params.get(run_id_param)
        if not run_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="run_id is required",
            )
        if user.role == UserRole.SUPER_ADMIN:
            return user
        result = await db.execute(
            select(RunAdmin).where(
                RunAdmin.run_id == int(run_id),
                RunAdmin.user_id == user.id,
            )
        )
        if not result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Run admin access required",
            )
        return user

    return dependency


def require_run_member(run_id_param: str = "run_id"):
    """Factory that returns a dependency checking run-level membership.

    Allows access if the user is a SUPER_ADMIN, is a run admin, or has
    an active RunMembership for the given run.

    Args:
        run_id_param: Name of the path parameter containing the run ID.
    """

    async def dependency(
        request: Request,
        user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> User:
        run_id = request.path_params.get(run_id_param)
        if not run_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="run_id is required",
            )
        run_id_int = int(run_id)

        # SUPER_ADMIN always has access
        if user.role == UserRole.SUPER_ADMIN:
            return user

        # Check if user is a run admin
        admin_result = await db.execute(
            select(RunAdmin).where(
                RunAdmin.run_id == run_id_int,
                RunAdmin.user_id == user.id,
            )
        )
        if admin_result.scalar_one_or_none():
            return user

        # Check if user is a run member
        member_result = await db.execute(
            select(RunMembership).where(
                RunMembership.run_id == run_id_int,
                RunMembership.user_id == user.id,
            )
        )
        if not member_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Run membership required",
            )
        return user

    return dependency
