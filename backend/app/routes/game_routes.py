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
    5. Admin can cancel a game (POST /games/{id}/cancel)
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.dependencies import get_current_admin, get_current_user
from app.database import get_db
from app.models.game import Game, GameStatus, RSVP, RSVPStatus
from app.models.team import GameResult, TeamAssignment, pick_team_names
from app.models.user import PlayerStatus, User
from app.models.notification import NotificationType
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
from app.models.algorithm_config import AlgorithmWeight, CustomMetric, PlayerCustomMetric
from app.services.team_balancer import CustomMetricDef, create_balanced_teams
from app.services.notification_service import send_bulk_notification

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
    await db.refresh(game, ["rsvps", "teams", "result"])
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
    """Update game details (admin only).

    Notifies all RSVPed players when time, date, or location changes.
    """
    result = await db.execute(
        select(Game).where(Game.id == game_id).options(selectinload(Game.rsvps))
    )
    game = result.scalar_one_or_none()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    update_fields = data.model_dump(exclude_unset=True)

    # Track meaningful changes that players should know about
    changes = []
    if "game_date" in update_fields and str(update_fields["game_date"]) != str(game.game_date):
        changes.append("date/time")
    if "location" in update_fields and update_fields["location"] != game.location:
        changes.append("location")

    for field, value in update_fields.items():
        setattr(game, field, value)

    # Notify RSVPed players about time/location changes
    if changes and game.rsvps:
        notifiable = [
            r for r in game.rsvps
            if r.status in (RSVPStatus.ACCEPTED, RSVPStatus.WAITLIST, RSVPStatus.PENDING)
        ]
        if notifiable:
            player_ids = [r.user_id for r in notifiable]
            players_result = await db.execute(select(User).where(User.id.in_(player_ids)))
            players = list(players_result.scalars().all())

            change_desc = " and ".join(changes)
            await send_bulk_notification(
                db,
                players,
                NotificationType.GAME_UPDATED,
                f"Game Updated: {game.title}",
                f"The {change_desc} for {game.title} has changed. "
                f"New details: {game.game_date.strftime('%A, %B %d at %I:%M %p')} at {game.location}.",
            )

    await db.flush()
    return game


# =============================================================================
# Cancel Game
# =============================================================================

@router.post("/{game_id}/cancel", response_model=GameResponse)
async def cancel_game(
    game_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    """Cancel a game and notify all RSVPed players (admin only).

    TEACHING NOTE:
        This lets an admin declare "no game this week." It:
        1. Sets the game status to CANCELLED
        2. Finds all players who accepted (or are on waitlist)
        3. Sends them a notification that the game is cancelled
    """
    result = await db.execute(
        select(Game).where(Game.id == game_id).options(selectinload(Game.rsvps))
    )
    game = result.scalar_one_or_none()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    if game.status == GameStatus.CANCELLED:
        raise HTTPException(status_code=400, detail="Game is already cancelled")
    if game.status == GameStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Cannot cancel a completed game")

    game.status = GameStatus.CANCELLED

    # Notify all players who accepted or are on waitlist
    notifiable_rsvps = [
        r for r in game.rsvps
        if r.status in (RSVPStatus.ACCEPTED, RSVPStatus.WAITLIST, RSVPStatus.PENDING)
    ]
    if notifiable_rsvps:
        player_ids = [r.user_id for r in notifiable_rsvps]
        players_result = await db.execute(select(User).where(User.id.in_(player_ids)))
        players = list(players_result.scalars().all())

        await send_bulk_notification(
            db,
            players,
            NotificationType.GAME_CANCELLED,
            f"Game Cancelled: {game.title}",
            f"The game scheduled for "
            f"{game.game_date.strftime('%A, %B %d at %I:%M %p')} "
            f"has been cancelled. No game this week.",
        )

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
        3. Runs the balancing algorithm for N teams
        4. Assigns random fun team names
        5. Stores team assignments
        6. Updates the game status to TEAMS_SET
    """
    result = await db.execute(
        select(Game).where(Game.id == game_id).options(selectinload(Game.rsvps))
    )
    game = result.scalar_one_or_none()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    # Get accepted players
    accepted_rsvps = [r for r in game.rsvps if r.status == RSVPStatus.ACCEPTED]
    if len(accepted_rsvps) < game.num_teams:
        raise HTTPException(
            status_code=400,
            detail=f"Need at least {game.num_teams} players to create {game.num_teams} teams",
        )

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

    # Load algorithm weights from DB (falls back to defaults if empty)
    weights_result = await db.execute(select(AlgorithmWeight))
    db_weights = weights_result.scalars().all()
    weights = {w.metric_name: w.weight for w in db_weights} if db_weights else None

    # Load custom metric definitions
    cm_result = await db.execute(select(CustomMetric))
    custom_metrics_db = cm_result.scalars().all()
    custom_metric_defs = [
        CustomMetricDef(name=cm.name, min_value=cm.min_value, max_value=cm.max_value, default_value=cm.default_value)
        for cm in custom_metrics_db
    ]

    # Load custom metric values for accepted players
    pcm_result = await db.execute(
        select(PlayerCustomMetric).where(PlayerCustomMetric.user_id.in_(player_ids))
    )
    player_custom_values = {}
    for pcm in pcm_result.scalars().all():
        metric = next((cm for cm in custom_metrics_db if cm.id == pcm.metric_id), None)
        if metric:
            player_custom_values.setdefault(pcm.user_id, {})[metric.name] = pcm.value

    # Run the balancing algorithm for N teams
    balanced_teams = create_balanced_teams(
        list(players),
        num_teams=game.num_teams,
        weights=weights,
        custom_metrics=custom_metric_defs,
        player_custom_values=player_custom_values,
    )

    # Pick random fun names for each team
    team_names = pick_team_names(game.num_teams)

    # Create team assignments
    for team_idx, team_players in enumerate(balanced_teams):
        team_id = f"team_{team_idx + 1}"
        team_name = team_names[team_idx]
        for player in team_players:
            db.add(TeamAssignment(
                game_id=game_id,
                user_id=player.id,
                team=team_id,
                team_name=team_name,
            ))

    game.status = GameStatus.TEAMS_SET

    # Notify all players about their team assignments
    team_lookup = {}
    for team_idx, team_players in enumerate(balanced_teams):
        for player in team_players:
            team_lookup[player.id] = team_names[team_idx]

    await send_bulk_notification(
        db,
        list(players),
        NotificationType.TEAMS_PUBLISHED,
        f"Teams Are Set: {game.title}",
        f"Teams have been published for {game.title}. Check the app to see your team!",
    )

    await db.flush()

    # Reload assignments with user relationship for response serialization
    result = await db.execute(
        select(TeamAssignment)
        .where(TeamAssignment.game_id == game_id)
        .options(selectinload(TeamAssignment.user))
    )
    return result.scalars().all()


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

    # Validate winning_team exists in assignments
    valid_teams = set(t.team for t in game.teams)
    if data.winning_team not in valid_teams:
        raise HTTPException(status_code=400, detail=f"Invalid team. Valid teams: {', '.join(sorted(valid_teams))}")

    game_result = GameResult(
        game_id=game_id,
        winning_team=data.winning_team,
        notes=data.notes,
    )
    db.add(game_result)

    # Update Jordan Factor for all players in the game
    for assignment in game.teams:
        player_result = await db.execute(select(User).where(User.id == assignment.user_id))
        player = player_result.scalar_one_or_none()
        if player:
            player.games_played += 1
            if assignment.team == data.winning_team:
                player.games_won += 1
            player.jordan_factor = player.games_won / player.games_played

    game.status = GameStatus.COMPLETED

    # Notify all participants that the game is complete and voting is open
    winning_team_name = next(
        (t.team_name for t in game.teams if t.team == data.winning_team),
        data.winning_team,
    )
    player_ids = list(set(t.user_id for t in game.teams))
    all_players_result = await db.execute(select(User).where(User.id.in_(player_ids)))
    all_players = list(all_players_result.scalars().all())

    await send_bulk_notification(
        db,
        all_players,
        NotificationType.GAME_COMPLETED,
        f"Game Complete: {game.title}",
        f"{winning_team_name} wins! Cast your MVP and Shaqtin' a Fool votes now.",
    )

    await db.flush()
    return game_result
