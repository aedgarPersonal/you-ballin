"""
Game Award Voting Routes
========================
MVP and "Shaqtin' a Fool" voting for game participants.

TEACHING NOTE:
    Voting flow:
    1. Admin records a game result (game status -> COMPLETED)
    2. Voting opens automatically until noon the next day
    3. Only players who were on a team for that game can vote
    4. Each player casts one MVP vote and one Shaqtin' vote
    5. Players can change their vote until the deadline
    6. At noon the next day, voting closes and results are published
       with top 10 overall standings and fun commentary

    The public results endpoint (/api/runs/{run_id}/games/{id}/awards) does NOT
    require authentication, so it can be displayed on the group's public page.

    The awards_router at /api/awards remains global and cross-run.
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.game import Game, GameStatus
from app.models.team import TeamAssignment
from app.models.user import User
from app.models.vote import GameVote, VoteType
from app.schemas.user import UserResponse
from app.schemas.vote import (
    AwardWinner,
    GameAwardsResponse,
    MyVotesResponse,
    RecentGameAwards,
    VoteCast,
    VoteResponse,
)

router = APIRouter(prefix="/api/runs/{run_id}/games", tags=["Voting"])
awards_router = APIRouter(prefix="/api/awards", tags=["Awards"])

def _get_voting_deadline(game: Game, deadline_hours: int = 16) -> datetime:
    """Calculate when voting closes (default: 16 hours after game start)."""
    game_time = game.game_date
    if game_time.tzinfo is None:
        game_time = game_time.replace(tzinfo=timezone.utc)
    return game_time + timedelta(hours=deadline_hours)


def _is_voting_open(game: Game, deadline_hours: int = 16) -> bool:
    """Check if the voting window is currently open."""
    if game.status != GameStatus.COMPLETED:
        return False
    now = datetime.now(timezone.utc)
    deadline = _get_voting_deadline(game, deadline_hours)
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)
    return now <= deadline


async def _verify_participant(db: AsyncSession, game_id: int, user_id: int) -> bool:
    """Check if a user was on a team for this game."""
    result = await db.execute(
        select(TeamAssignment).where(
            TeamAssignment.game_id == game_id,
            TeamAssignment.user_id == user_id,
        )
    )
    return result.scalar_one_or_none() is not None


async def _get_game_in_run(db: AsyncSession, run_id: int, game_id: int) -> Game:
    """Fetch a game and verify it belongs to the specified run."""
    result = await db.execute(select(Game).where(Game.id == game_id))
    game = result.scalar_one_or_none()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    if game.run_id != run_id:
        raise HTTPException(status_code=404, detail="Game not found in this run")
    return game


# =============================================================================
# Cast / Update Votes
# =============================================================================

@router.post("/{game_id}/votes", response_model=VoteResponse, status_code=status.HTTP_201_CREATED)
async def cast_vote(
    run_id: int,
    game_id: int,
    data: VoteCast,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Cast or update a vote for MVP or Shaqtin' a Fool.

    TEACHING NOTE:
        Business rules enforced:
        - Game must belong to the specified run
        - Game must be completed
        - Voting window must be open (24h after game time)
        - Voter must have been a participant (on a team)
        - Cannot vote for yourself
        - Nominee must also have been a participant
        - One vote per category (upsert: update if exists)
    """
    # Verify game exists and belongs to this run
    game = await _get_game_in_run(db, run_id, game_id)

    if game.status != GameStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Voting is only available for completed games")

    if not _is_voting_open(game):
        raise HTTPException(status_code=400, detail="Voting window has closed for this game")

    # Verify voter was a participant
    if not await _verify_participant(db, game_id, user.id):
        raise HTTPException(status_code=403, detail="Only game participants can vote")

    # Cannot vote for yourself
    if data.nominee_id == user.id:
        raise HTTPException(status_code=400, detail="You cannot vote for yourself")

    # Verify nominee was a participant
    if not await _verify_participant(db, game_id, data.nominee_id):
        raise HTTPException(status_code=400, detail="Nominee must be a game participant")

    vote_type = VoteType(data.vote_type)

    # Check for existing vote (upsert)
    existing_result = await db.execute(
        select(GameVote).where(
            GameVote.game_id == game_id,
            GameVote.voter_id == user.id,
            GameVote.vote_type == vote_type,
        )
    )
    existing = existing_result.scalar_one_or_none()

    if existing:
        existing.nominee_id = data.nominee_id
        existing.created_at = datetime.utcnow()
        vote = existing
    else:
        vote = GameVote(
            game_id=game_id,
            voter_id=user.id,
            nominee_id=data.nominee_id,
            vote_type=vote_type,
        )
        db.add(vote)

    await db.flush()
    return vote


# =============================================================================
# Get My Votes
# =============================================================================

@router.get("/{game_id}/votes/mine", response_model=MyVotesResponse)
async def get_my_votes(
    run_id: int,
    game_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get the current user's votes for a specific game.

    TEACHING NOTE:
        This powers the voting UI - it shows the user their existing
        votes so they know what they've already picked and can change
        before the deadline.
    """
    # Verify game belongs to this run
    await _get_game_in_run(db, run_id, game_id)

    result = await db.execute(
        select(GameVote).where(
            GameVote.game_id == game_id,
            GameVote.voter_id == user.id,
        )
    )
    votes = result.scalars().all()

    mvp_vote = next((v for v in votes if v.vote_type == VoteType.MVP), None)
    shaqtin_vote = next((v for v in votes if v.vote_type == VoteType.SHAQTIN), None)
    xfactor_vote = next((v for v in votes if v.vote_type == VoteType.XFACTOR), None)

    return MyVotesResponse(
        mvp_vote=VoteResponse.model_validate(mvp_vote) if mvp_vote else None,
        shaqtin_vote=VoteResponse.model_validate(shaqtin_vote) if shaqtin_vote else None,
        xfactor_vote=VoteResponse.model_validate(xfactor_vote) if xfactor_vote else None,
    )


# =============================================================================
# Public Award Results
# =============================================================================

@router.get("/{game_id}/awards", response_model=GameAwardsResponse)
async def get_game_awards(
    run_id: int,
    game_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get the award results for a game (PUBLIC - no auth required).

    TEACHING NOTE:
        This is the public-facing endpoint that displays on the group's
        main page. It returns:
        - Whether voting is still open
        - The voting deadline
        - MVP winner (player with most MVP votes)
        - Shaqtin' winner (player with most Shaqtin' votes)

        If voting is still open, winners are NOT revealed to prevent
        bandwagon voting. Only vote counts are shown.
    """
    # Verify game belongs to this run
    game = await _get_game_in_run(db, run_id, game_id)

    if game.status != GameStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Awards not available for this game")

    # Get run's voting deadline hours
    from app.models.run import Run
    run_result = await db.execute(select(Run).where(Run.id == run_id))
    run = run_result.scalar_one_or_none()
    deadline_hours = run.voting_deadline_hours if run else 16

    voting_open = _is_voting_open(game, deadline_hours)
    deadline = _get_voting_deadline(game, deadline_hours)

    # Count eligible voters (all team participants)
    participant_count = await db.execute(
        select(func.count()).where(TeamAssignment.game_id == game_id)
    )
    total_voters = participant_count.scalar()

    # Count total votes cast
    vote_count = await db.execute(
        select(func.count(func.distinct(GameVote.voter_id))).where(
            GameVote.game_id == game_id
        )
    )
    votes_cast = vote_count.scalar()

    response = GameAwardsResponse(
        game_id=game_id,
        voting_open=voting_open,
        voting_deadline=deadline,
        total_voters=total_voters,
        votes_cast=votes_cast,
    )

    # Only reveal winners after voting closes
    if not voting_open:
        response.mvp = await _get_winner(db, game_id, VoteType.MVP)
        response.shaqtin = await _get_winner(db, game_id, VoteType.SHAQTIN)
        response.xfactor = await _get_winner(db, game_id, VoteType.XFACTOR)

        response.commentary = game.commentary

    return response


async def _get_winner(
    db: AsyncSession, game_id: int, vote_type: VoteType
) -> AwardWinner | None:
    """Find the player with the most votes for a given category.

    TEACHING NOTE:
        We use a GROUP BY + ORDER BY COUNT query to find the top vote-getter.
        In case of a tie, the player who received their first vote earliest
        wins (ORDER BY MIN(created_at)).
    """
    result = await db.execute(
        select(
            GameVote.nominee_id,
            func.count(GameVote.id).label("vote_count"),
        )
        .where(
            GameVote.game_id == game_id,
            GameVote.vote_type == vote_type,
        )
        .group_by(GameVote.nominee_id)
        .order_by(
            func.count(GameVote.id).desc(),
            func.min(GameVote.created_at).asc(),  # Tiebreaker: earliest first vote
        )
        .limit(1)
    )
    row = result.one_or_none()

    if not row:
        return None

    nominee_id, count = row
    player_result = await db.execute(select(User).where(User.id == nominee_id))
    player = player_result.scalar_one_or_none()

    if not player:
        return None

    return AwardWinner(
        player=UserResponse.model_validate(player),
        vote_count=count,
    )


# =============================================================================
# Recent Award Winners (for Dashboard) - Global, cross-run
# =============================================================================

@awards_router.get("/recent", response_model=list[RecentGameAwards])
async def get_recent_awards(
    run_id: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Get award winners from the most recent completed games.

    Returns up to 5 most recent games that have completed voting,
    with their MVP, Shaqtin', and X Factor winners.

    Optionally filter by run_id to get awards for a specific run only.
    """
    # Find recently completed games where voting has closed
    query = (
        select(Game)
        .where(Game.status == GameStatus.COMPLETED)
        .order_by(Game.game_date.desc())
        .limit(5)
    )
    if run_id:
        query = query.where(Game.run_id == run_id)

    result = await db.execute(query)
    games = result.scalars().all()

    recent_awards = []
    now = datetime.utcnow()

    for game in games:
        deadline = _get_voting_deadline(game)
        if now <= deadline:
            # Voting still open, skip this game
            continue

        mvp = await _get_winner(db, game.id, VoteType.MVP)
        shaqtin = await _get_winner(db, game.id, VoteType.SHAQTIN)
        xfactor = await _get_winner(db, game.id, VoteType.XFACTOR)

        # Only include if at least one award was given
        if mvp or shaqtin or xfactor:
            recent_awards.append(RecentGameAwards(
                game_id=game.id,
                game_title=game.title,
                game_date=game.game_date,
                mvp=mvp,
                shaqtin=shaqtin,
                xfactor=xfactor,
            ))

    return recent_awards
