"""
Player Routes
=============
Player profiles, listings, and self-management.

Two routers are exported:
- router: global player endpoints (/api/players)
- run_players_router: run-scoped player listing (/api/runs/{run_id}/players)
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.run import RunAdmin, RunMembership
from app.models.user import PlayerStatus, User, UserRole
from app.schemas.user import UserListResponse, UserResponse, UserUpdate

router = APIRouter(prefix="/api/players", tags=["Players"])
run_players_router = APIRouter(prefix="/api/runs/{run_id}/players", tags=["Run Players"])

REDACTED_FIELDS = ("avg_offense", "avg_defense", "avg_overall", "mobility", "dropin_priority")


async def _is_admin_for_run(user: User, run_id: int, db: AsyncSession) -> bool:
    """Check if user is super_admin/admin or a run admin."""
    if user.role in (UserRole.SUPER_ADMIN, UserRole.ADMIN):
        return True
    result = await db.execute(
        select(RunAdmin.id).where(RunAdmin.run_id == run_id, RunAdmin.user_id == user.id)
    )
    return result.scalar_one_or_none() is not None


def _redact_user(user_response: dict) -> dict:
    """Remove rating fields from a user response dict."""
    for field in REDACTED_FIELDS:
        user_response[field] = None
    return user_response


# =============================================================================
# Run-Scoped Player Listing
# =============================================================================

@run_players_router.get("")
async def list_run_players(
    run_id: int,
    search: str | None = None,
    include_inactive: bool = False,
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all approved players in a specific run."""
    statuses = [PlayerStatus.REGULAR, PlayerStatus.DROPIN]
    if include_inactive:
        statuses.append(PlayerStatus.INACTIVE)

    base_where = [RunMembership.run_id == run_id, RunMembership.player_status.in_(statuses)]
    if search:
        base_where.append(User.full_name.ilike(f"%{search}%") | User.username.ilike(f"%{search}%"))

    count_query = (
        select(func.count())
        .select_from(User)
        .join(RunMembership, RunMembership.user_id == User.id)
        .where(*base_where)
    )
    total = (await db.execute(count_query)).scalar()

    query = (
        select(User, RunMembership)
        .join(RunMembership, RunMembership.user_id == User.id)
        .where(*base_where)
        .offset(skip).limit(limit).order_by(User.full_name)
    )
    result = await db.execute(query)
    rows = result.all()

    is_admin = await _is_admin_for_run(current_user, run_id, db)
    user_dicts = []
    for user_obj, membership in rows:
        d = UserResponse.model_validate(user_obj).model_dump()
        # Override with run-scoped membership fields
        d["player_status"] = membership.player_status.value if hasattr(membership.player_status, 'value') else membership.player_status
        d["dropin_priority"] = membership.dropin_priority
        user_dicts.append(d)

    if not is_admin:
        user_dicts = [_redact_user(d) for d in user_dicts]

    return {"users": user_dicts, "total": total}


@run_players_router.get("/{player_id}/rating-summary")
async def get_player_rating_summary(
    run_id: int,
    player_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Get a player's rating summary for a specific run.

    Returns the average ratings and game stats from RunPlayerStats.
    """
    from app.models.run import RunPlayerStats

    result = await db.execute(
        select(RunPlayerStats).where(
            RunPlayerStats.run_id == run_id,
            RunPlayerStats.user_id == player_id,
        )
    )
    stats = result.scalar_one_or_none()
    if not stats:
        return {
            "avg_offense": None,
            "avg_defense": None,
            "avg_overall": None,
            "jordan_factor": 0.5,
            "games_played": 0,
            "games_won": 0,
            "total_ratings": 0,
        }

    return {
        "avg_offense": round(stats.avg_offense, 1),
        "avg_defense": round(stats.avg_defense, 1),
        "avg_overall": round(stats.avg_overall, 1),
        "jordan_factor": round(stats.jordan_factor, 3),
        "games_played": stats.games_played,
        "games_won": stats.games_won,
        "total_ratings": 0,
    }


# =============================================================================
# Global Player Endpoints
# =============================================================================

@router.get("/me", response_model=UserResponse)
async def get_my_profile(user: User = Depends(get_current_user)):
    """Get the current user's profile."""
    return user


@router.patch("/me", response_model=UserResponse)
async def update_my_profile(
    data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update the current user's profile."""
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    await db.flush()
    return user


@router.get("/{player_id}", response_model=UserResponse)
async def get_player(
    player_id: int,
    run_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Get a specific player's public profile."""
    result = await db.execute(select(User).where(User.id == player_id))
    player = result.scalar_one_or_none()
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    return player
