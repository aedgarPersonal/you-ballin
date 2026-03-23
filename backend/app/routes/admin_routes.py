"""
Admin Routes
============
Admin-only endpoints for managing players, approving registrations,
updating player stats, and bulk-importing players.

TEACHING NOTE:
    All routes in this file require admin authentication via the
    `get_current_admin` dependency. This means:
    1. The user must have a valid JWT token
    2. Their role must be "admin"
    Otherwise, they get a 403 Forbidden response.
"""

import random

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_admin
from app.auth.password import hash_password
from app.database import get_db
from app.models.notification import Notification, NotificationType
from app.models.user import PlayerStatus, User, UserRole
from app.schemas.user import (
    AdminUserUpdate,
    ImportPlayerEntry,
    ImportPlayersRequest,
    ImportPlayersResponse,
    UserListResponse,
    UserResponse,
)

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

    # Track status change before applying updates
    old_status = user.player_status

    # Convert string enums to proper types
    if "player_status" in update_data:
        update_data["player_status"] = PlayerStatus(update_data["player_status"])
    if "role" in update_data:
        update_data["role"] = UserRole(update_data["role"])

    for field, value in update_data.items():
        setattr(user, field, value)

    # Notify the player if their status changed
    if "player_status" in data.model_dump(exclude_unset=True) and user.player_status != old_status:
        status_labels = {
            PlayerStatus.REGULAR: "regular",
            PlayerStatus.DROPIN: "drop-in",
            PlayerStatus.INACTIVE: "inactive",
        }
        new_label = status_labels.get(user.player_status, str(user.player_status.value))
        db.add(Notification(
            user_id=user.id,
            type=NotificationType.STATUS_CHANGED,
            title="Player Status Updated",
            message=f"Your player status has been changed to {new_label}.",
        ))

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


# =============================================================================
# Bulk Import Players
# =============================================================================

# Available avatar IDs from the legacy NBA players list
AVATAR_IDS = [
    "jordan", "magic", "bird", "isiah", "drexler", "wilkins", "ewing",
    "barkley", "malone", "stockton", "hakeem", "robinson", "pippen",
    "shaq", "iverson", "kobe", "duncan", "kg", "penny", "payton",
    "kidd", "carter", "tmac", "nash", "dirk", "reggie", "ray",
    "pierce", "yao", "benwallace", "lebron", "wade", "cp3", "melo",
    "dwight", "pau", "tony", "manu", "rondo", "billups", "westbrook",
    "durant", "drose", "bosh", "davis", "frazier", "ljohnson",
]

DEFAULT_IMPORT_PASSWORD = "Password123"


@router.post("/import-players", response_model=ImportPlayersResponse)
async def import_players(
    data: ImportPlayersRequest,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    """Bulk import players from external records.

    TEACHING NOTE:
        This lets admins quickly onboard an existing group of players.
        Each imported player gets:
        - A generated email and username from their name
        - A random NBA legend avatar (changeable later)
        - The default password "Password123" (should change on first login)
        - Pre-populated win/loss records and Jordan Factor
        - Status set to "regular" (already approved, ready to play)
    """
    hashed_pw = hash_password(DEFAULT_IMPORT_PASSWORD)
    used_avatars = []
    created = []
    skipped = []

    for entry in data.players:
        name = entry.name.strip()
        # Generate username and email from the player's name
        username = name.lower().replace(" ", "").replace("'", "")
        email = f"{username}@youballin.local"

        # Check if username or email already exists
        existing = await db.execute(
            select(User).where(
                (User.username == username) | (User.email == email)
            )
        )
        if existing.scalar_one_or_none():
            skipped.append(f"{name} (already exists as '{username}')")
            continue

        # Pick a random avatar that hasn't been used in this batch yet
        available = [a for a in AVATAR_IDS if a not in used_avatars]
        if not available:
            # All avatars used, reset and allow duplicates
            available = AVATAR_IDS
        avatar = random.choice(available)
        used_avatars.append(avatar)

        # Calculate Jordan Factor from win/loss record
        games_played = entry.wins + entry.losses
        jordan_factor = entry.wins / games_played if games_played > 0 else 0.5

        user = User(
            email=email,
            username=username,
            hashed_password=hashed_pw,
            full_name=name,
            avatar_url=avatar,
            role=UserRole.PLAYER,
            player_status=PlayerStatus.REGULAR,
            is_active=True,
            games_played=games_played,
            games_won=entry.wins,
            jordan_factor=jordan_factor,
        )
        db.add(user)
        created.append(name)

    await db.flush()

    return ImportPlayersResponse(
        created_count=len(created),
        skipped_count=len(skipped),
        created_players=created,
        skipped_players=skipped,
    )
