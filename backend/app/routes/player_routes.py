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
from app.models.run import RunMembership
from app.models.user import PlayerStatus, User
from app.schemas.user import UserListResponse, UserResponse, UserUpdate

router = APIRouter(prefix="/api/players", tags=["Players"])
run_players_router = APIRouter(prefix="/api/runs/{run_id}/players", tags=["Run Players"])


# =============================================================================
# Run-Scoped Player Listing
# =============================================================================

@run_players_router.get("", response_model=UserListResponse)
async def list_run_players(
    run_id: int,
    search: str | None = None,
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """List all approved players in a specific run.

    TEACHING NOTE:
        This endpoint powers the "Players" page within a run context.
        It queries RunMembership joined with User to return only players
        who are REGULAR or DROPIN in the specified run.
    """
    query = (
        select(User)
        .join(RunMembership, RunMembership.user_id == User.id)
        .where(
            RunMembership.run_id == run_id,
            RunMembership.player_status.in_([PlayerStatus.REGULAR, PlayerStatus.DROPIN]),
        )
    )

    if search:
        query = query.where(
            User.full_name.ilike(f"%{search}%") | User.username.ilike(f"%{search}%")
        )

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar()

    # Paginate
    query = query.offset(skip).limit(limit).order_by(User.full_name)
    result = await db.execute(query)
    users = result.scalars().all()

    return UserListResponse(users=users, total=total)


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
    """Get a specific player's public profile.

    Optionally accepts a run_id query param to include run-specific context
    (reserved for future use with run-scoped stats).
    """
    result = await db.execute(select(User).where(User.id == player_id))
    player = result.scalar_one_or_none()
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    return player
