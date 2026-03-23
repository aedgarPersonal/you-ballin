"""
Rating Routes
=============
Anonymous player ratings with once-per-month update limit.

TEACHING NOTE:
    Key design decisions:
    - Ratings are anonymous: the rater_id is never exposed
    - Each player can only rate another player once (then update monthly)
    - When a rating is created/updated, we recalculate the player's
      cached averages to avoid expensive aggregation queries
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.rating import PlayerRating
from app.models.user import User
from app.schemas.rating import (
    MyRatingForPlayer,
    PlayerRatingSummary,
    RatingCreate,
    RatingResponse,
)

router = APIRouter(prefix="/api/ratings", tags=["Ratings"])


@router.get("/player/{player_id}/summary", response_model=PlayerRatingSummary)
async def get_player_rating_summary(
    player_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Get aggregated ratings for a player.

    TEACHING NOTE:
        We read from the cached values on the User model for performance.
        These are recalculated whenever a rating is submitted.
    """
    result = await db.execute(select(User).where(User.id == player_id))
    player = result.scalar_one_or_none()
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")

    count_result = await db.execute(
        select(func.count()).where(PlayerRating.player_id == player_id)
    )
    total_ratings = count_result.scalar()

    return PlayerRatingSummary(
        player_id=player_id,
        avg_offense=player.avg_offense,
        avg_defense=player.avg_defense,
        avg_overall=player.avg_overall,
        total_ratings=total_ratings,
        winner_rating=player.winner_rating,
    )


@router.get("/player/{player_id}/mine", response_model=MyRatingForPlayer)
async def get_my_rating_for_player(
    player_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Check if the current user has rated a player, and when they can update.

    TEACHING NOTE:
        This powers the rating form UI. It tells the frontend:
        - Whether the user has already rated this player
        - What their current rating is
        - Whether they can update (based on the 30-day cooldown)
    """
    result = await db.execute(
        select(PlayerRating).where(
            PlayerRating.player_id == player_id,
            PlayerRating.rater_id == user.id,
        )
    )
    rating = result.scalar_one_or_none()

    if not rating:
        return MyRatingForPlayer(has_rated=False, can_update=True)

    # Check 30-day cooldown
    now = datetime.now(timezone.utc)
    cooldown_end = rating.updated_at.replace(tzinfo=timezone.utc) + timedelta(days=30)
    can_update = now >= cooldown_end

    return MyRatingForPlayer(
        has_rated=True,
        rating=RatingResponse.model_validate(rating),
        can_update=can_update,
        next_update_available=cooldown_end if not can_update else None,
    )


@router.post("/player/{player_id}", response_model=RatingResponse, status_code=status.HTTP_201_CREATED)
async def rate_player(
    player_id: int,
    data: RatingCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Rate a player (or update an existing rating if eligible).

    TEACHING NOTE:
        Business rules:
        1. Can't rate yourself
        2. One rating per player-rater pair
        3. Can update existing rating only after 30 days
        4. After save, recalculate the player's cached averages
    """
    if user.id == player_id:
        raise HTTPException(status_code=400, detail="You cannot rate yourself")

    # Verify target player exists
    target_result = await db.execute(select(User).where(User.id == player_id))
    target = target_result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Player not found")

    # Check for existing rating
    existing_result = await db.execute(
        select(PlayerRating).where(
            PlayerRating.player_id == player_id,
            PlayerRating.rater_id == user.id,
        )
    )
    existing = existing_result.scalar_one_or_none()

    if existing:
        # Enforce 30-day cooldown
        now = datetime.now(timezone.utc)
        cooldown_end = existing.updated_at.replace(tzinfo=timezone.utc) + timedelta(days=30)
        if now < cooldown_end:
            raise HTTPException(
                status_code=429,
                detail=f"You can update this rating after {cooldown_end.isoformat()}",
            )
        # Update existing rating
        existing.offense = data.offense
        existing.defense = data.defense
        existing.overall = data.overall
        existing.updated_at = now
        rating = existing
    else:
        # Create new rating
        rating = PlayerRating(
            player_id=player_id,
            rater_id=user.id,
            offense=data.offense,
            defense=data.defense,
            overall=data.overall,
        )
        db.add(rating)

    await db.flush()

    # Recalculate cached averages on the target player
    avg_result = await db.execute(
        select(
            func.avg(PlayerRating.offense),
            func.avg(PlayerRating.defense),
            func.avg(PlayerRating.overall),
        ).where(PlayerRating.player_id == player_id)
    )
    avgs = avg_result.one()
    target.avg_offense = round(avgs[0] or 3.0, 2)
    target.avg_defense = round(avgs[1] or 3.0, 2)
    target.avg_overall = round(avgs[2] or 3.0, 2)

    await db.flush()
    return rating
