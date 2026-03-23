"""
Admin Routes
============
Admin-only endpoints for managing players, approving registrations,
and updating player stats.

TEACHING NOTE:
    All routes in this file require admin authentication via the
    `get_current_admin` dependency. This means:
    1. The user must have a valid JWT token
    2. Their role must be "admin"
    Otherwise, they get a 403 Forbidden response.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_admin
from app.database import get_db
from app.models.notification import Notification, NotificationType
from app.models.user import PlayerStatus, User, UserRole
from app.schemas.user import AdminUserUpdate, UserListResponse, UserResponse

router = APIRouter(prefix="/api/admin", tags=["Admin"])


@router.get("/pending", response_model=UserListResponse)
async def list_pending_registrations(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    """List all users waiting for registration approval."""
    query = select(User).where(User.player_status == PlayerStatus.PENDING)
    result = await db.execute(query)
    users = result.scalars().all()

    count = await db.execute(
        select(func.count()).where(User.player_status == PlayerStatus.PENDING)
    )
    total = count.scalar()

    return UserListResponse(users=users, total=total)


@router.post("/approve/{user_id}", response_model=UserResponse)
async def approve_registration(
    user_id: int,
    player_status: str = "regular",
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    """Approve a pending registration and set player status.

    Args:
        user_id: The user to approve.
        player_status: "regular" or "dropin" - determines invitation priority.
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.player_status != PlayerStatus.PENDING:
        raise HTTPException(status_code=400, detail="User is not pending approval")

    user.player_status = PlayerStatus(player_status)

    # Send approval notification
    notification = Notification(
        user_id=user.id,
        type=NotificationType.REGISTRATION_APPROVED,
        title="Registration Approved!",
        message=f"Welcome to the group! You've been approved as a {player_status} player.",
    )
    db.add(notification)

    await db.flush()
    return user


@router.post("/deny/{user_id}", response_model=UserResponse)
async def deny_registration(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    """Deny a pending registration."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.player_status = PlayerStatus.INACTIVE
    user.is_active = False

    notification = Notification(
        user_id=user.id,
        type=NotificationType.REGISTRATION_DENIED,
        title="Registration Update",
        message="Your registration was not approved at this time.",
    )
    db.add(notification)

    await db.flush()
    return user


@router.patch("/players/{user_id}", response_model=UserResponse)
async def update_player_admin(
    user_id: int,
    data: AdminUserUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    """Update a player's admin-managed fields.

    TEACHING NOTE:
        This is where admins set:
        - player_status: regular vs dropin
        - role: player vs admin
        - Physical stats: height, age, mobility
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = data.model_dump(exclude_unset=True)

    # Convert string enums to proper types
    if "player_status" in update_data:
        update_data["player_status"] = PlayerStatus(update_data["player_status"])
    if "role" in update_data:
        update_data["role"] = UserRole(update_data["role"])

    for field, value in update_data.items():
        setattr(user, field, value)

    await db.flush()
    return user


@router.get("/players", response_model=UserListResponse)
async def list_all_players(
    status_filter: str | None = None,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    """List ALL users including pending and inactive (admin only)."""
    query = select(User)
    if status_filter:
        query = query.where(User.player_status == status_filter)

    result = await db.execute(query.order_by(User.created_at.desc()))
    users = result.scalars().all()

    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar()

    return UserListResponse(users=users, total=total)
