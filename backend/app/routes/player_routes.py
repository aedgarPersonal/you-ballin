"""
Player Routes
=============
Player profiles, listings, and self-management.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.user import PlayerStatus, User
from app.schemas.user import UserListResponse, UserResponse, UserUpdate

router = APIRouter(prefix="/api/players", tags=["Players"])


@router.get("", response_model=UserListResponse)
async def list_players(
    status_filter: str | None = None,
    search: str | None = None,
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """List all approved players in the group.

    TEACHING NOTE:
        This endpoint powers the "Players" page. It only returns
        approved players (regular + dropin), not pending registrations.
        Admins can see everyone via the admin routes.
    """
    query = select(User).where(
        User.player_status.in_([PlayerStatus.REGULAR, PlayerStatus.DROPIN])
    )

    if status_filter:
        query = query.where(User.player_status == status_filter)

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
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Get a specific player's public profile."""
    result = await db.execute(select(User).where(User.id == player_id))
    player = result.scalar_one_or_none()
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    return player
