"""
Rating Routes
=============
Anonymous player ratings with once-per-month update limit, scoped per-run.

TEACHING NOTE:
    Key design decisions:
    - Ratings are anonymous: the rater_id is never exposed
    - Each player can only rate another player once per run (then update monthly)
    - When a rating is created/updated, we recalculate both the run-scoped
      RunPlayerStats averages and the global User cached averages
    - Ratings are scoped to a run because players may perform differently
      in different groups
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.rating import PlayerRating
from app.models.run import RunPlayerStats
from app.models.user import User
from app.schemas.rating import (
    MyRatingForPlayer,
    PlayerRatingSummary,
    RatingCreate,
    RatingResponse,
)

router = APIRouter(prefix="/api/runs/{run_id}/ratings", tags=["Ratings"])


@router.get("/player/{player_id}/summary", response_model=PlayerRatingSummary)
async def get_player_rating_summary(
    run_id: int,
    player_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Get aggregated ratings for a player within a specific run.

    TEACHING NOTE:
        We first try to read from RunPlayerStats for run-specific averages.
        If no run stats exist yet, we fall back to the cached values on the
        User model for a reasonable default.
    """
    result = await db.execute(select(User).where(User.id == player_id))
    player = result.scalar_one_or_none()
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")

    # Try run-specific stats first
    stats_result = await db.execute(
        select(RunPlayerStats).where(
            RunPlayerStats.run_id == run_id,
            RunPlayerStats.user_id == player_id,
        )
    )
    stats = stats_result.scalar_one_or_none()

    # Count ratings for this run
    count_result = await db.execute(
        select(func.count()).where(
            PlayerRating.player_id == player_id,
            PlayerRating.run_id == run_id,
        )
    )
    total_ratings = count_result.scalar()

    if stats:
        return PlayerRatingSummary(
            player_id=player_id,
            total_ratings=total_ratings,
            win_rate=stats.win_rate,
            games_played=stats.games_played,
            games_won=stats.games_won,
        )

    # Fall back to user-level stats if no run stats
    return PlayerRatingSummary(
        player_id=player_id,
        total_ratings=total_ratings,
        win_rate=player.win_rate,
        games_played=player.games_played,
        games_won=player.games_won,
    )


@router.get("/player/{player_id}/mine", response_model=MyRatingForPlayer)
async def get_my_rating_for_player(
    run_id: int,
    player_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Check if the current user has rated a player in this run, and when they can update.

    TEACHING NOTE:
        This powers the rating form UI. It tells the frontend:
        - Whether the user has already rated this player in this run
        - What their current rating is
        - Whether they can update (based on the 30-day cooldown)
    """
    result = await db.execute(
        select(PlayerRating).where(
            PlayerRating.run_id == run_id,
            PlayerRating.player_id == player_id,
            PlayerRating.rater_id == user.id,
        )
    )
    rating = result.scalar_one_or_none()

    if not rating:
        return MyRatingForPlayer(has_rated=False, can_update=True)

    # Check 30-day cooldown
    now = datetime.utcnow()
    cooldown_end = rating.updated_at + timedelta(days=30)
    can_update = now >= cooldown_end

    return MyRatingForPlayer(
        has_rated=True,
        rating=RatingResponse.model_validate(rating),
        can_update=can_update,
        next_update_available=cooldown_end if not can_update else None,
    )


@router.post("/player/{player_id}", response_model=RatingResponse, status_code=status.HTTP_201_CREATED)
async def rate_player(
    run_id: int,
    player_id: int,
    data: RatingCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Rate a player within a run (or update an existing rating if eligible).

    TEACHING NOTE:
        Business rules:
        1. Can't rate yourself
        2. One rating per player-rater pair per run
        3. Can update existing rating only after 30 days
        4. After save, recalculate both run-scoped RunPlayerStats
           and global User cached averages
    """
    if user.id == player_id:
        raise HTTPException(status_code=400, detail="You cannot rate yourself")

    # Verify target player exists
    target_result = await db.execute(select(User).where(User.id == player_id))
    target = target_result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Player not found")

    # Check for existing rating in this run
    existing_result = await db.execute(
        select(PlayerRating).where(
            PlayerRating.run_id == run_id,
            PlayerRating.player_id == player_id,
            PlayerRating.rater_id == user.id,
        )
    )
    existing = existing_result.scalar_one_or_none()

    if existing:
        # Enforce 30-day cooldown
        now = datetime.utcnow()
        cooldown_end = existing.updated_at + timedelta(days=30)
        if now < cooldown_end:
            raise HTTPException(
                status_code=429,
                detail=f"You can update this rating after {cooldown_end.isoformat()}",
            )
        # Update existing rating
        existing.scoring = data.scoring
        existing.defense = data.defense
        existing.overall = data.overall
        existing.athleticism = data.athleticism
        existing.fitness = data.fitness
        existing.updated_at = now
        rating = existing
    else:
        # Create new rating scoped to this run
        rating = PlayerRating(
            run_id=run_id,
            player_id=player_id,
            rater_id=user.id,
            scoring=data.scoring,
            defense=data.defense,
            overall=data.overall,
            athleticism=data.athleticism,
            fitness=data.fitness,
        )
        db.add(rating)

    await db.flush()

    # Note: avg_* fields have been removed. Peer ratings still exist in the
    # PlayerRating table but are no longer cached on User or RunPlayerStats.
    # Custom metrics (via PlayerCustomMetric) are the authoritative source
    # for skill-based team balancing factors.

    await db.flush()
    return rating
