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

from app.auth.dependencies import get_current_super_admin, get_current_user, require_run_admin
from app.auth.password import hash_password
from app.database import get_db
from app.models.algorithm_config import CustomMetric, PlayerCustomMetric
from app.models.notification import Notification, NotificationType
from app.models.run import Run, RunMembership, RunPlayerStats
from app.models.user import PlayerStatus, User, UserRole
from app.schemas.user import (
    AdminUserUpdate,
    ImportPlayerEntry,
    ImportPlayersRequest,
    ImportPlayersResponse,
    QuickAddPlayer,
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

    # Sync the global user status to match
    user.player_status = PlayerStatus(player_status)

    # Ensure defaults for nullable fields
    if user.height_inches is None:
        user.height_inches = 70  # 5'10"
    if user.age is None:
        user.age = 30

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
    users = list(result.scalars().all())

    # Enrich users with dropin_priority from membership
    membership_result = await db.execute(
        select(RunMembership).where(RunMembership.run_id == run_id)
    )
    memberships = {m.user_id: m for m in membership_result.scalars().all()}
    for user in users:
        m = memberships.get(user.id)
        if m:
            user.dropin_priority = m.dropin_priority

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
    """Update a player's profile, physical stats, game stats, and run membership.

    Profile fields (stored on User):
        - full_name, email, username, phone, avatar_url

    Physical fields (stored on User):
        - height_inches, age, mobility

    Game stats (stored on User + RunPlayerStats):
        - games_played, games_won (recalculates win rate)

    Run-specific fields (stored on RunMembership):
        - player_status: regular, dropin, inactive
        - dues_paid
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

    # Update run-scoped fields on RunMembership and sync to User
    if "player_status" in update_data:
        new_ps = PlayerStatus(update_data.pop("player_status"))
        membership.player_status = new_ps
        user.player_status = new_ps
        # Default dropin_priority to 1 when switching to dropin
        if new_ps == PlayerStatus.DROPIN and membership.dropin_priority is None:
            membership.dropin_priority = 1
    if "dues_paid" in update_data:
        membership.dues_paid = update_data.pop("dues_paid")
    if "dropin_priority" in update_data:
        membership.dropin_priority = update_data.pop("dropin_priority")

    # Update profile fields on User
    for field in ("full_name", "email", "username", "phone", "avatar_url"):
        if field in update_data:
            setattr(user, field, update_data.pop(field))

    # Update role (super admin only) or run admin
    if "role" in update_data:
        new_role = update_data.pop("role")
        if new_role in ("player", "admin", "super_admin"):
            user.role = UserRole(new_role)

    # Update is_active
    if "is_active" in update_data:
        user.is_active = update_data.pop("is_active")

    # Update physical fields on User
    for field in ("height_inches", "age"):
        if field in update_data:
            setattr(user, field, update_data.pop(field))

    # Update game stats on User and RunPlayerStats
    stats_changed = False
    if "games_played" in update_data or "games_won" in update_data:
        if "games_played" in update_data:
            user.games_played = update_data.pop("games_played")
        if "games_won" in update_data:
            user.games_won = update_data.pop("games_won")
        user.win_rate = user.games_won / user.games_played if user.games_played > 0 else 0.5
        stats_changed = True

        # Also update RunPlayerStats for this run
        rps_result = await db.execute(
            select(RunPlayerStats).where(
                RunPlayerStats.run_id == run_id,
                RunPlayerStats.user_id == user_id,
            )
        )
        rps = rps_result.scalar_one_or_none()
        if rps:
            rps.games_played = user.games_played
            rps.games_won = user.games_won
            rps.win_rate = user.win_rate

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
    # Additional NBA
    "rodman", "bogues", "abdulrauf", "eaton", "olivermiller", "camby",
    "cassell", "artest", "kirilenko", "prince", "kawhi",
    # WNBA
    "taurasi", "suebird", "lisaleslie", "swoopes", "candaceparker",
    "mayamoore", "catchings", "cynthiacooper", "laurenjackson",
    "tinathompson", "stewie", "ajawilson",
    "caitlinclark", "griner", "angelreese",
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
        - Pre-populated win/loss records and Win Rate
        - Status set to "regular" (already approved, ready to play)
        - A RunMembership for this run with REGULAR status
        - A RunPlayerStats record for this run with imported stats
    """
    hashed_pw = hash_password(DEFAULT_IMPORT_PASSWORD)
    used_avatars = []
    created = []
    skipped = []

    # Pre-load the run's custom metrics for mapping metric names to IDs
    metrics_result = await db.execute(
        select(CustomMetric).where(CustomMetric.run_id == run_id)
    )
    run_metrics = {m.name: m for m in metrics_result.scalars().all()}

    for entry in data.players:
        name = entry.name.strip()
        email = entry.email.strip().lower()
        # Generate username from the player's name
        username = name.lower().replace(" ", "").replace("'", "")

        # Check if email already exists (email is the uniqueness key)
        existing = await db.execute(
            select(User).where(User.email == email)
        )
        if existing.scalar_one_or_none():
            skipped.append(f"{name} ({email} already exists)")
            continue

        # If username conflicts, append a number
        uname_check = await db.execute(select(User).where(User.username == username))
        if uname_check.scalar_one_or_none():
            username = f"{username}{random.randint(1, 999)}"

        # Pick a random avatar that hasn't been used in this batch yet
        available = [a for a in AVATAR_IDS if a not in used_avatars]
        if not available:
            # All avatars used, reset and allow duplicates
            available = AVATAR_IDS
        avatar = random.choice(available)
        used_avatars.append(avatar)

        # Calculate Win Rate from win/loss record
        games_played = entry.wins + entry.losses
        win_rate = entry.wins / games_played if games_played > 0 else 0.5

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
            win_rate=win_rate,
            height_inches=entry.height_inches,
            age=entry.age,
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
            win_rate=win_rate,
        ))

        # Create PlayerCustomMetric entries for any provided metrics
        for metric_name, metric_value in entry.metrics.items():
            cm = run_metrics.get(metric_name)
            if cm:
                db.add(PlayerCustomMetric(
                    user_id=user.id,
                    metric_id=cm.id,
                    value=metric_value,
                ))

        created.append(name)

    await db.flush()

    return ImportPlayersResponse(
        created_count=len(created),
        skipped_count=len(skipped),
        created_players=created,
        skipped_players=skipped,
    )


# =============================================================================
# Quick Add Player (Run-Scoped)
# =============================================================================

@run_admin_router.post("/add-player", response_model=UserResponse)
async def quick_add_player(
    run_id: int,
    data: QuickAddPlayer,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_run_admin()),
):
    """Quickly add a single player to this run.

    Creates a new user account and immediately adds them as a regular
    member of the run. If no email is provided, generates one from the name.
    """
    name = data.full_name.strip()
    email = data.email.strip().lower()
    username = name.lower().replace(" ", "").replace("'", "")

    # Check if email already exists (email is the uniqueness key)
    existing = await db.execute(
        select(User).where(User.email == email)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"A player with email '{email}' already exists")

    # If username conflicts, append a number
    uname_check = await db.execute(select(User).where(User.username == username))
    if uname_check.scalar_one_or_none():
        username = f"{username}{random.randint(1, 999)}"

    # Pick random avatar
    available = [a for a in AVATAR_IDS]
    avatar = random.choice(available)

    games_played = data.wins + data.losses
    win_rate = data.wins / games_played if games_played > 0 else 0.5

    user = User(
        email=email,
        username=username,
        hashed_password=hash_password(DEFAULT_IMPORT_PASSWORD),
        full_name=name,
        phone=data.phone,
        avatar_url=avatar,
        role=UserRole.PLAYER,
        player_status=PlayerStatus.REGULAR,
        is_active=True,
        games_played=games_played,
        games_won=data.wins,
        win_rate=win_rate,
        height_inches=data.height_inches,
        age=data.age,
    )
    db.add(user)
    await db.flush()

    db.add(RunMembership(
        run_id=run_id,
        user_id=user.id,
        player_status=PlayerStatus.REGULAR,
    ))
    db.add(RunPlayerStats(
        run_id=run_id,
        user_id=user.id,
        games_played=games_played,
        games_won=data.wins,
        win_rate=win_rate,
    ))

    # Create PlayerCustomMetric entries for any provided metrics
    if data.metrics:
        metrics_result = await db.execute(
            select(CustomMetric).where(CustomMetric.run_id == run_id)
        )
        run_metrics = {m.name: m for m in metrics_result.scalars().all()}
        for metric_name, metric_value in data.metrics.items():
            cm = run_metrics.get(metric_name)
            if cm:
                db.add(PlayerCustomMetric(
                    user_id=user.id,
                    metric_id=cm.id,
                    value=metric_value,
                ))

    await db.flush()
    return user


@run_admin_router.post("/players/{user_id}/reset-password")
async def admin_reset_password(
    run_id: int,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_run_admin()),
):
    """Reset a player's password to 'Password123' (run admin only)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Player not found")

    user.hashed_password = hash_password("Password123")
    await db.flush()
    return {"message": f"Password for {user.full_name} has been reset to default."}


@run_admin_router.delete("/players/{user_id}", status_code=204)
async def delete_player(
    run_id: int,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_run_admin()),
):
    """Permanently delete a player and all associated data (run admin only)."""
    from sqlalchemy import delete, text
    from app.models.game import RSVP
    from app.models.team import TeamAssignment
    from app.models.vote import GameVote
    from app.models.rating import PlayerRating
    from app.models.push_subscription import PushSubscription
    from app.models.run import RunAdmin, PlayerSuggestion
    from app.models.invite_code import InviteCode

    # Verify user exists
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Player not found")

    # Prevent deleting super admins
    if user.role == UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=400, detail="Cannot delete a super admin")

    # Delete all associated data
    await db.execute(delete(GameVote).where((GameVote.voter_id == user_id) | (GameVote.nominee_id == user_id)))
    await db.execute(delete(TeamAssignment).where(TeamAssignment.user_id == user_id))
    await db.execute(delete(RSVP).where(RSVP.user_id == user_id))
    await db.execute(delete(Notification).where(Notification.user_id == user_id))
    await db.execute(delete(PushSubscription).where(PushSubscription.user_id == user_id))
    await db.execute(delete(PlayerRating).where((PlayerRating.player_id == user_id) | (PlayerRating.rater_id == user_id)))
    await db.execute(delete(RunPlayerStats).where(RunPlayerStats.user_id == user_id))
    await db.execute(delete(RunMembership).where(RunMembership.user_id == user_id))
    await db.execute(delete(RunAdmin).where(RunAdmin.user_id == user_id))
    await db.execute(delete(PlayerSuggestion).where(
        (PlayerSuggestion.suggested_user_id == user_id) |
        (PlayerSuggestion.suggested_by_user_id == user_id)
    ))
    # Nullify invite codes created by this user
    await db.execute(
        InviteCode.__table__.update().where(InviteCode.created_by_user_id == user_id).values(created_by_user_id=None)
    )
    # Delete custom metrics
    await db.execute(text("DELETE FROM player_custom_metrics WHERE user_id = :uid"), {"uid": user_id})

    await db.delete(user)
    await db.flush()


# =============================================================================
# Season Management
# =============================================================================

@run_admin_router.post("/season-reset")
async def reset_season(
    run_id: int,
    data: dict,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_run_admin()),
):
    """Archive current season stats and reset for a new season.

    Preserves all games, results, votes, and team assignments.
    Only resets RunPlayerStats counters (games, wins, awards).
    Player ratings (scoring, defense, etc.) are kept.
    """
    from app.models.season import SeasonArchive, SeasonPlayerSnapshot
    from app.models.game import Game, GameStatus

    label = data.get("label", "")

    # Get the run
    run_result = await db.execute(select(Run).where(Run.id == run_id))
    run = run_result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    # Auto-generate label if not provided
    if not label:
        from datetime import datetime
        label = f"Season ({run.start_date.strftime('%b %Y') if run.start_date else 'Start'} - {datetime.now().strftime('%b %Y')})"

    # Count completed games in current season
    game_count = await db.scalar(
        select(func.count(Game.id)).where(
            Game.run_id == run_id, Game.status == GameStatus.COMPLETED
        )
    )

    # Get all current stats
    stats_result = await db.execute(
        select(RunPlayerStats).where(RunPlayerStats.run_id == run_id)
    )
    all_stats = stats_result.scalars().all()
    active_players = [s for s in all_stats if s.games_played > 0]

    # Create season archive
    archive = SeasonArchive(
        run_id=run_id,
        label=label,
        start_date=run.start_date,
        end_date=run.end_date,
        total_games=game_count or 0,
        total_players=len(active_players),
    )
    db.add(archive)
    await db.flush()

    # Snapshot each player's stats
    for stats in all_stats:
        snapshot = SeasonPlayerSnapshot(
            season_id=archive.id,
            user_id=stats.user_id,
            games_played=stats.games_played,
            games_won=stats.games_won,
            win_rate=stats.win_rate,
            mvp_count=stats.mvp_count,
            shaqtin_count=stats.shaqtin_count,
            xfactor_count=stats.xfactor_count,
        )
        db.add(snapshot)

    # Reset current stats (keep ratings, zero out game stats and awards)
    for stats in all_stats:
        stats.games_played = 0
        stats.games_won = 0
        stats.win_rate = 0.5
        stats.mvp_count = 0
        stats.shaqtin_count = 0
        stats.xfactor_count = 0

    # Also reset User-level cached stats
    user_ids = [s.user_id for s in all_stats]
    if user_ids:
        users_result = await db.execute(select(User).where(User.id.in_(user_ids)))
        for user in users_result.scalars().all():
            user.games_played = 0
            user.games_won = 0
            user.win_rate = 0.5
            user.mvp_count = 0
            user.shaqtin_count = 0
            user.xfactor_count = 0

    await db.flush()

    return {
        "message": f"Season archived as '{label}'",
        "archive_id": archive.id,
        "players_archived": len(all_stats),
        "games_in_season": game_count or 0,
    }


    # Season listing/detail endpoints are on the stats router for public access
