"""
Admin Routes
============
Split into two routers:
- Super Admin routes (/api/admin) for global user management.
- Run Admin routes (/api/runs/{run_id}/admin) for run-scoped player management.

TEACHING NOTE:
    Super admin endpoints manage user-level fields (role, is_active).
    Run admin endpoints manage run-scoped membership, approvals, and imports.
    Run admins are authorized via the run_admins table; super admins have
    access to everything.
"""

import random

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_super_admin, require_run_admin
from app.auth.password import hash_password
from app.database import get_db
from app.models.notification import Notification, NotificationType
from app.models.run import RunMembership, RunPlayerStats
from app.models.user import PlayerStatus, User, UserRole
from app.schemas.user import (
    AdminUserUpdate,
    ImportPlayerEntry,
    ImportPlayersRequest,
    ImportPlayersResponse,
    UserListResponse,
    UserResponse,
)

# =============================================================================
# Super Admin Router — global user management
# =============================================================================

router = APIRouter(prefix="/api/admin", tags=["Super Admin"])


@router.get("/users", response_model=UserListResponse)
async def list_all_users(
    status_filter: str | None = None,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_super_admin),
):
    """List ALL users globally (super admin only)."""
    query = select(User)
    if status_filter:
        query = query.where(User.player_status == status_filter)

    result = await db.execute(query.order_by(User.created_at.desc()))
    users = result.scalars().all()

    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar()

    return UserListResponse(users=users, total=total)


@router.patch("/users/{user_id}", response_model=UserResponse)
async def update_user_global(
    user_id: int,
    data: AdminUserUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_super_admin),
):
    """Update user-level fields: role, is_active (super admin only)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = data.model_dump(exclude_unset=True)

    if "role" in update_data:
        update_data["role"] = UserRole(update_data["role"])
    if "is_active" in update_data:
        user.is_active = update_data.pop("is_active")

    for field, value in update_data.items():
        if field in ("role",):
            setattr(user, field, value)

    await db.flush()
    return user


# =============================================================================
# Run Admin Router — run-scoped player management
# =============================================================================

run_admin_router = APIRouter(prefix="/api/runs/{run_id}/admin", tags=["Run Admin"])


@run_admin_router.get("/pending", response_model=UserListResponse)
async def list_pending_memberships(
    run_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_run_admin()),
):
    """List all users with pending membership for this run."""
    query = (
        select(User)
        .join(RunMembership, RunMembership.user_id == User.id)
        .where(
            RunMembership.run_id == run_id,
            RunMembership.player_status == PlayerStatus.PENDING,
        )
    )
    result = await db.execute(query)
    users = result.scalars().all()

    count = await db.execute(
        select(func.count())
        .select_from(RunMembership)
        .where(
            RunMembership.run_id == run_id,
            RunMembership.player_status == PlayerStatus.PENDING,
        )
    )
    total = count.scalar()

    return UserListResponse(users=users, total=total)


@run_admin_router.post("/approve/{user_id}", response_model=UserResponse)
async def approve_membership(
    run_id: int,
    user_id: int,
    player_status: str = "regular",
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_run_admin()),
):
    """Approve a pending run membership and set player status.

    Args:
        user_id: The user to approve.
        player_status: "regular" or "dropin" - determines invitation priority.
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    membership_result = await db.execute(
        select(RunMembership).where(
            RunMembership.run_id == run_id,
            RunMembership.user_id == user_id,
        )
    )
    membership = membership_result.scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=404, detail="Membership not found for this run")

    if membership.player_status != PlayerStatus.PENDING:
        raise HTTPException(status_code=400, detail="Membership is not pending approval")

    membership.player_status = PlayerStatus(player_status)

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


@run_admin_router.post("/deny/{user_id}", response_model=UserResponse)
async def deny_membership(
    run_id: int,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_run_admin()),
):
    """Deny a pending run membership."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    membership_result = await db.execute(
        select(RunMembership).where(
            RunMembership.run_id == run_id,
            RunMembership.user_id == user_id,
        )
    )
    membership = membership_result.scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=404, detail="Membership not found for this run")

    membership.player_status = PlayerStatus.INACTIVE

    notification = Notification(
        user_id=user.id,
        type=NotificationType.REGISTRATION_DENIED,
        title="Registration Update",
        message="Your registration was not approved at this time.",
    )
    db.add(notification)

    await db.flush()
    return user


@run_admin_router.get("/players", response_model=UserListResponse)
async def list_run_players(
    run_id: int,
    status_filter: str | None = None,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_run_admin()),
):
    """List all members of this run (run admin only)."""
    query = (
        select(User)
        .join(RunMembership, RunMembership.user_id == User.id)
        .where(RunMembership.run_id == run_id)
    )
    if status_filter:
        query = query.where(RunMembership.player_status == status_filter)

    result = await db.execute(query.order_by(User.created_at.desc()))
    users = result.scalars().all()

    count_query = (
        select(func.count())
        .select_from(RunMembership)
        .where(RunMembership.run_id == run_id)
    )
    if status_filter:
        count_query = count_query.where(RunMembership.player_status == status_filter)
    count_result = await db.execute(count_query)
    total = count_result.scalar()

    return UserListResponse(users=users, total=total)


@run_admin_router.patch("/players/{user_id}", response_model=UserResponse)
async def update_run_player(
    run_id: int,
    user_id: int,
    data: AdminUserUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_run_admin()),
):
    """Update a player's run-specific and physical fields.

    Run-specific fields (stored on RunMembership):
        - player_status: regular, dropin, inactive
        - dues_paid

    Physical fields (stored on User):
        - height_inches, age, mobility
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    membership_result = await db.execute(
        select(RunMembership).where(
            RunMembership.run_id == run_id,
            RunMembership.user_id == user_id,
        )
    )
    membership = membership_result.scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=404, detail="Membership not found for this run")

    update_data = data.model_dump(exclude_unset=True)

    # Track status change before applying updates
    old_status = membership.player_status

    # Update run-scoped fields on RunMembership
    if "player_status" in update_data:
        membership.player_status = PlayerStatus(update_data.pop("player_status"))
    if "dues_paid" in update_data:
        membership.dues_paid = update_data.pop("dues_paid")

    # Update physical fields on User (skip role/is_active — those are super admin only)
    for field in ("height_inches", "age", "mobility"):
        if field in update_data:
            setattr(user, field, update_data[field])

    # Notify the player if their run membership status changed
    if membership.player_status != old_status:
        status_labels = {
            PlayerStatus.REGULAR: "regular",
            PlayerStatus.DROPIN: "drop-in",
            PlayerStatus.INACTIVE: "inactive",
        }
        new_label = status_labels.get(membership.player_status, str(membership.player_status.value))
        db.add(Notification(
            user_id=user.id,
            type=NotificationType.STATUS_CHANGED,
            title="Player Status Updated",
            message=f"Your player status has been changed to {new_label}.",
        ))

    await db.flush()
    return user


# =============================================================================
# Bulk Import Players (Run-Scoped)
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


@run_admin_router.post("/import-players", response_model=ImportPlayersResponse)
async def import_players(
    run_id: int,
    data: ImportPlayersRequest,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_run_admin()),
):
    """Bulk import players into this run.

    TEACHING NOTE:
        This lets admins quickly onboard an existing group of players.
        Each imported player gets:
        - A generated email and username from their name
        - A random NBA legend avatar (changeable later)
        - The default password "Password123" (should change on first login)
        - Pre-populated win/loss records and Jordan Factor
        - Status set to "regular" (already approved, ready to play)
        - A RunMembership for this run with REGULAR status
        - A RunPlayerStats record for this run with imported stats
    """
    hashed_pw = hash_password(DEFAULT_IMPORT_PASSWORD)
    used_avatars = []
    created = []
    skipped = []

    for entry in data.players:
        name = entry.name.strip()
        # Generate username and email from the player's name
        username = name.lower().replace(" ", "").replace("'", "")
        email = f"{username}@youballin.app"

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
        await db.flush()  # Get user.id for membership/stats creation

        # Create RunMembership for this run
        db.add(RunMembership(
            run_id=run_id,
            user_id=user.id,
            player_status=PlayerStatus.REGULAR,
        ))

        # Create RunPlayerStats for this run
        db.add(RunPlayerStats(
            run_id=run_id,
            user_id=user.id,
            games_played=games_played,
            games_won=entry.wins,
            jordan_factor=jordan_factor,
        ))

        created.append(name)

    await db.flush()

    return ImportPlayersResponse(
        created_count=len(created),
        skipped_count=len(skipped),
        created_players=created,
        skipped_players=skipped,
    )
