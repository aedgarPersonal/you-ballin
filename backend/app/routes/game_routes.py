"""
Game Management Routes
======================
CRUD operations for games, RSVPs, and team management.

TEACHING NOTE:
    The game lifecycle flows through these endpoints:
    1. Admin creates a game (POST /games)
    2. Players RSVP (POST /games/{id}/rsvp)
    3. Admin (or scheduler) triggers team creation (POST /games/{id}/teams)
    4. Admin records results (POST /games/{id}/result)
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.dependencies import get_current_admin, get_current_user
from app.database import get_db
from app.models.game import Game, GameStatus, RSVP, RSVPStatus
from app.models.team import GameResult, TeamAssignment, TeamSide
from app.models.user import PlayerStatus, User
from app.schemas.game import (
    GameCreate,
    GameDetailResponse,
    GameResponse,
    GameResultCreate,
    GameResultResponse,
    GameUpdate,
    RSVPCreate,
    RSVPResponse,
    TeamAssignmentResponse,
)
from app.services.team_balancer import create_balanced_teams

router = APIRouter(prefix="/api/games", tags=["Games"])


# =============================================================================
# Game CRUD
# =============================================================================

@router.get("", response_model=list[GameResponse])
async def list_games(
    status_filter: str | None = None,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """List all games, optionally filtered by status."""
    query = select(Game).order_by(Game.game_date.desc())
    if status_filter:
        query = query.where(Game.status == status_filter)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=GameResponse, status_code=status.HTTP_201_CREATED)
async def create_game(
    data: GameCreate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    """Create a new game (admin only)."""
    game = Game(**data.model_dump())
    db.add(game)
    await db.flush()
    return game


@router.get("/{game_id}", response_model=GameDetailResponse)
async def get_game(
    game_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Get game details including RSVPs and team assignments."""
    result = await db.execute(
        select(Game)
        .where(Game.id == game_id)
        .options(
            selectinload(Game.rsvps).selectinload(RSVP.user),
            selectinload(Game.teams).selectinload(TeamAssignment.user),
        )
    )
    game = result.scalar_one_or_none()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    return game


@router.patch("/{game_id}", response_model=GameResponse)
async def update_game(
    game_id: int,
    data: GameUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    """Update game details (admin only)."""
    result = await db.execute(select(Game).where(Game.id == game_id))
    game = result.scalar_one_or_none()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(game, field, value)
    await db.flush()
    return game


# =============================================================================
# RSVP Management
# =============================================================================

@router.post("/{game_id}/rsvp", response_model=RSVPResponse)
async def rsvp_to_game(
    game_id: int,
    data: RSVPCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """RSVP to a game.

    TEACHING NOTE:
        Business rules enforced here:
        - Only approved players (regular or dropin) can RSVP
        - Regular players can RSVP anytime before the deadline
        - Drop-in players can only RSVP when status is DROPIN_OPEN
        - If the game is full, drop-in players go on the waitlist
        - First-come-first-served for drop-in spots
    """
    # Verify game exists and is accepting RSVPs
    result = await db.execute(select(Game).where(Game.id == game_id))
    game = result.scalar_one_or_none()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    # Check player is approved
    if user.player_status == PlayerStatus.PENDING:
        raise HTTPException(status_code=403, detail="Your registration is pending approval")
    if user.player_status == PlayerStatus.INACTIVE:
        raise HTTPException(status_code=403, detail="Your account is inactive")

    # Drop-in players can only join when spots are open
    if user.player_status == PlayerStatus.DROPIN:
        if game.status not in (GameStatus.DROPIN_OPEN, GameStatus.INVITES_SENT):
            raise HTTPException(status_code=403, detail="Drop-in spots are not yet available")

    # Check for existing RSVP
    existing = await db.execute(
        select(RSVP).where(RSVP.game_id == game_id, RSVP.user_id == user.id)
    )
    rsvp = existing.scalar_one_or_none()

    rsvp_status = RSVPStatus(data.status)

    if rsvp:
        # Update existing RSVP
        rsvp.status = rsvp_status
        rsvp.responded_at = datetime.now(timezone.utc)
    else:
        # Handle drop-in waitlist logic
        if (
            user.player_status == PlayerStatus.DROPIN
            and rsvp_status == RSVPStatus.ACCEPTED
            and game.spots_remaining <= 0
        ):
            rsvp_status = RSVPStatus.WAITLIST

        rsvp = RSVP(
            game_id=game_id,
            user_id=user.id,
            status=rsvp_status,
            responded_at=datetime.now(timezone.utc),
        )
        db.add(rsvp)

    await db.flush()
    return rsvp


@router.get("/{game_id}/rsvps", response_model=list[RSVPResponse])
async def get_game_rsvps(
    game_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Get all RSVPs for a game."""
    result = await db.execute(
        select(RSVP)
        .where(RSVP.game_id == game_id)
        .options(selectinload(RSVP.user))
        .order_by(RSVP.responded_at)
    )
    return result.scalars().all()


# =============================================================================
# Team Management
# =============================================================================

@router.post("/{game_id}/teams", response_model=list[TeamAssignmentResponse])
async def generate_teams(
    game_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    """Generate balanced teams for a game (admin only).

    TEACHING NOTE:
        This endpoint triggers the team balancing algorithm. It:
        1. Gets all accepted RSVPs
        2. Fetches each player's ratings and stats
        3. Runs the balancing algorithm
        4. Stores team assignments
        5. Updates the game status to TEAMS_SET
    """
    result = await db.execute(
        select(Game).where(Game.id == game_id).options(selectinload(Game.rsvps))
    )
    game = result.scalar_one_or_none()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    # Get accepted players
    accepted_rsvps = [r for r in game.rsvps if r.status == RSVPStatus.ACCEPTED]
    if len(accepted_rsvps) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 players to create teams")

    # Fetch full player data
    player_ids = [r.user_id for r in accepted_rsvps]
    players_result = await db.execute(select(User).where(User.id.in_(player_ids)))
    players = players_result.scalars().all()

    # Clear existing team assignments
    existing_teams = await db.execute(
        select(TeamAssignment).where(TeamAssignment.game_id == game_id)
    )
    for assignment in existing_teams.scalars().all():
        await db.delete(assignment)

    # Run the balancing algorithm
    team_a, team_b = create_balanced_teams(list(players))

    # Create team assignments
    assignments = []
    for i, player in enumerate(team_a):
        assignment = TeamAssignment(
            game_id=game_id,
            user_id=player.id,
            team=TeamSide.TEAM_A,
            is_starter=i < 5,  # First 5 are starters
        )
        db.add(assignment)
        assignments.append(assignment)

    for i, player in enumerate(team_b):
        assignment = TeamAssignment(
            game_id=game_id,
            user_id=player.id,
            team=TeamSide.TEAM_B,
            is_starter=i < 5,
        )
        db.add(assignment)
        assignments.append(assignment)

    game.status = GameStatus.TEAMS_SET
    await db.flush()
    return assignments


@router.get("/{game_id}/teams", response_model=list[TeamAssignmentResponse])
async def get_teams(
    game_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Get team assignments for a game."""
    result = await db.execute(
        select(TeamAssignment)
        .where(TeamAssignment.game_id == game_id)
        .options(selectinload(TeamAssignment.user))
    )
    return result.scalars().all()


# =============================================================================
# Game Results
# =============================================================================

@router.post("/{game_id}/result", response_model=GameResultResponse, status_code=status.HTTP_201_CREATED)
async def record_result(
    game_id: int,
    data: GameResultCreate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    """Record the outcome of a game (admin only).

    TEACHING NOTE:
        After recording the result, we update each player's Jordan Factor.
        The Jordan Factor tracks win percentage (games_won / games_played).
        Named after the GOAT - a high Jordan Factor means you win a lot.

        We use explicit games_won and games_played counters instead of
        recalculating from scratch each time. This is faster and makes
        the win/loss record directly visible to players.

        The Jordan Factor feeds back into the team balancing algorithm,
        so consistent winners get balanced against each other in future
        games, creating fairer matchups over time.
    """
    # Verify game exists
    result = await db.execute(
        select(Game).where(Game.id == game_id).options(selectinload(Game.teams))
    )
    game = result.scalar_one_or_none()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    # Check for existing result
    existing = await db.execute(select(GameResult).where(GameResult.game_id == game_id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Result already recorded for this game")

    winning_team = TeamSide(data.winning_team)

    game_result = GameResult(
        game_id=game_id,
        winning_team=winning_team,
        score_team_a=data.score_team_a,
        score_team_b=data.score_team_b,
        notes=data.notes,
    )
    db.add(game_result)

    # Update Jordan Factor for all players in the game
    for assignment in game.teams:
        player_result = await db.execute(select(User).where(User.id == assignment.user_id))
        player = player_result.scalar_one_or_none()
        if player:
            player.games_played += 1
            if assignment.team == winning_team:
                player.games_won += 1
            player.jordan_factor = player.games_won / player.games_played

    game.status = GameStatus.COMPLETED
    await db.flush()
    return game_result
