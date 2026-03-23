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
from app.models.team import GameResult, TeamAssignment, TeamScore, pick_team_names
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
    """Get game details including RSVPs, team assignments, and result."""
    result = await db.execute(
        select(Game)
        .where(Game.id == game_id)
        .options(
            selectinload(Game.rsvps).selectinload(RSVP.user),
            selectinload(Game.teams).selectinload(TeamAssignment.user),
            selectinload(Game.result).selectinload(GameResult.team_scores),
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
    """Record the outcome of a game night with per-team scores (admin only).

    TEACHING NOTE:
        A game night typically consists of multiple individual games (e.g.,
        best of 5). The admin enters the win count for each team.

        Example: Team A won 3 games, Team B won 2 games.
        Total individual games = 3 + 2 = 5.
        Team A players: games_played += 5, games_won += 3
        Team B players: games_played += 5, games_won += 2

        The Jordan Factor (games_won / games_played) is now more granular
        than the old binary system, giving a truer picture of win rate.
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

    # Validate all teams have scores and no invalid teams
    valid_teams = set(t.team for t in game.teams)
    submitted_teams = set(ts.team for ts in data.team_scores)
    if submitted_teams != valid_teams:
        raise HTTPException(
            status_code=400,
            detail=f"Must provide scores for all teams. Expected: {', '.join(sorted(valid_teams))}",
        )

    # At least one team must have wins > 0
    total_games = sum(ts.wins for ts in data.team_scores)
    if total_games == 0:
        raise HTTPException(status_code=400, detail="At least one team must have wins > 0")

    # Create game result
    game_result = GameResult(game_id=game_id, notes=data.notes)
    db.add(game_result)
    await db.flush()  # Get game_result.id

    # Build team-name lookup and score map
    team_name_lookup = {}
    for t in game.teams:
        if t.team not in team_name_lookup:
            team_name_lookup[t.team] = t.team_name

    score_map = {}
    for ts in data.team_scores:
        score_map[ts.team] = ts.wins
        db.add(TeamScore(
            game_result_id=game_result.id,
            team=ts.team,
            team_name=team_name_lookup.get(ts.team, ts.team),
            wins=ts.wins,
        ))

    # Update Jordan Factor for all players
    for assignment in game.teams:
        player_result = await db.execute(select(User).where(User.id == assignment.user_id))
        player = player_result.scalar_one_or_none()
        if player:
            team_wins = score_map.get(assignment.team, 0)
            player.games_played += total_games
            player.games_won += team_wins
            player.jordan_factor = player.games_won / player.games_played if player.games_played > 0 else 0.5

    game.status = GameStatus.COMPLETED

    # Build notification message
    score_parts = sorted(data.team_scores, key=lambda ts: ts.wins, reverse=True)
    score_summary = " - ".join(
        f"{team_name_lookup.get(ts.team, ts.team)} {ts.wins}"
        for ts in score_parts
    )
    top_team = score_parts[0]
    is_tie = len(score_parts) > 1 and score_parts[0].wins == score_parts[1].wins
    winner_msg = "It's a tie!" if is_tie else f"{team_name_lookup.get(top_team.team, top_team.team)} wins!"

    player_ids = list(set(t.user_id for t in game.teams))
    all_players_result = await db.execute(select(User).where(User.id.in_(player_ids)))
    all_players = list(all_players_result.scalars().all())

    await send_bulk_notification(
        db,
        all_players,
        NotificationType.GAME_COMPLETED,
        f"Game Complete: {game.title}",
        f"{winner_msg} Final: {score_summary}. Cast your MVP and Shaqtin' votes before noon tomorrow!",
    )

    await db.flush()

    # Reload to get team_scores relationship populated
    result = await db.execute(
        select(GameResult).where(GameResult.id == game_result.id)
        .options(selectinload(GameResult.team_scores))
    )
    return result.scalar_one()
