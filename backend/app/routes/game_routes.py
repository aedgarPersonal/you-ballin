"""
Game Management Routes (Run-Scoped)
====================================
CRUD operations for games, RSVPs, and team management within a Run.

TEACHING NOTE:
    The game lifecycle flows through these endpoints:
    1. Admin creates a game (POST /runs/{run_id}/games)
    2. Players RSVP (POST /runs/{run_id}/games/{id}/rsvp)
    3. Admin (or scheduler) triggers team creation (POST /runs/{run_id}/games/{id}/teams)
    4. Admin records results (POST /runs/{run_id}/games/{id}/result)
    5. Admin can cancel a game (POST /runs/{run_id}/games/{id}/cancel)

    Every game belongs to a Run. The run_id comes from the URL path,
    ensuring all operations are scoped to the correct run.
"""

import logging
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status

logger = logging.getLogger(__name__)
from sqlalchemy import delete, select, func as sqlfunc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.dependencies import get_current_user, require_run_admin, require_run_member
from app.database import get_db
from app.models.game import Game, GameStatus, RSVP, RSVPStatus
from app.models.run import Run, RunMembership, RunPlayerStats
from app.models.team import GameResult, TeamAssignment, TeamScore, pick_team_names
from app.models.user import PlayerStatus, User, UserRole
from app.models.notification import NotificationType
from app.schemas.game import (
    AdminRSVPCreate,
    GameCreate,
    GameDetailResponse,
    GameResponse,
    GameResultCreate,
    GameResultResponse,
    GameUpdate,
    RSVPCreate,
    RSVPResponse,
    TeamAddPlayerRequest,
    TeamAssignmentResponse,
    TeamAssignmentUpdate,
)
from app.models.algorithm_config import AlgorithmWeight, CustomMetric, PlayerCustomMetric
from app.services.team_balancer import CustomMetricDef, create_balanced_teams
from app.services.notification_service import send_bulk_notification

router = APIRouter(prefix="/api/runs/{run_id}/games", tags=["Games"])


# =============================================================================
# Helpers
# =============================================================================

async def _build_commentary(
    seed: str | None,
    score_map: dict,
    team_name_lookup: dict,
    game,
    total_games: int,
) -> str | None:
    """Expand admin commentary into a fun game recap using AI.

    If no seed is provided, returns None. Uses Claude API if available,
    falls back to simple expansion.
    """
    if not seed:
        return None

    sorted_teams = sorted(score_map.items(), key=lambda x: x[1], reverse=True)
    winner_id, winner_score = sorted_teams[0]
    loser_id, loser_score = sorted_teams[-1]
    winner_name = team_name_lookup.get(winner_id, winner_id)
    loser_name = team_name_lookup.get(loser_id, loser_id)

    team_players = {}
    for t in game.teams:
        team_players.setdefault(t.team, []).append(t)
    winner_roster = [t.user.full_name for t in team_players.get(winner_id, []) if t.user]
    loser_roster = [t.user.full_name for t in team_players.get(loser_id, []) if t.user]

    # Try AI-enhanced commentary
    from app.config import settings
    if settings.anthropic_api_key:
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

            prompt = (
                f"You are a fun, witty sports commentator for a pickup basketball league. "
                f"Write a 2-3 sentence game recap based on the admin's notes below.\n\n"
                f"Admin notes: {seed}\n\n"
                f"Game details:\n"
                f"- {winner_name} ({', '.join(winner_roster)}) won {winner_score}-{loser_score} against {loser_name} ({', '.join(loser_roster)})\n"
                f"- Scores represent games won in the session (e.g. 3-2 means won 3 games, lost 2)\n"
                f"- {total_games} total games played\n\n"
                f"Rules:\n"
                f"- Keep it fun, playful, and basketball-themed\n"
                f"- Reference specific player names from the admin notes when possible\n"
                f"- Use the admin's observations as the core of the recap\n"
                f"- 2-3 sentences max, no hashtags or emojis\n"
                f"- Write as a single paragraph"
            )

            response = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=200,
                messages=[{"role": "user", "content": prompt}],
            )
            return response.content[0].text.strip()
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"AI commentary failed, using fallback: {e}")

    # Fallback: simple expansion
    is_close = (winner_score - loser_score) == 1
    if is_close:
        return f"{seed}. {winner_name} edges {loser_name} {winner_score}-{loser_score} in a tight {total_games}-game session."
    elif loser_score == 0:
        return f"{seed}. {winner_name} sweeps {loser_name} {winner_score}-0 — total domination across {total_games} games."
    else:
        return f"{seed}. {winner_name} takes the series {winner_score}-{loser_score} across {total_games} games."


async def _recalculate_odds(game: Game, db: AsyncSession):
    """Recalculate odds_line from current team assignments."""
    import math

    result = await db.execute(
        select(TeamAssignment)
        .where(TeamAssignment.game_id == game.id)
        .options(selectinload(TeamAssignment.user))
    )
    assignments = result.scalars().all()

    team_groups: dict[str, list] = {}
    team_name_map: dict[str, str] = {}
    for a in assignments:
        team_groups.setdefault(a.team, []).append(a.user)
        team_name_map[a.team] = a.team_name

    teams_list = list(team_groups.keys())
    if len(teams_list) != 2:
        game.odds_line = None
        return

    def _composite(u):
        jf = u.win_rate or 0.5
        ht = min((u.height_inches or 70) / 84, 1)
        ag = 1 - min(max(((u.age or 30) - 18), 0) / 32, 1)
        return jf * 0.70 + ht * 0.15 + ag * 0.15

    team_names = [team_name_map[t] for t in teams_list]
    balanced_teams = [team_groups[t] for t in teams_list]

    avgs = []
    for team_players in balanced_teams:
        scores = [_composite(p) for p in team_players]
        avgs.append(sum(scores) / len(scores) if scores else 0)

    diff = avgs[0] - avgs[1]
    prob0 = 1 / (1 + math.exp(-diff * 8))
    prob1 = 1 - prob0

    def _ml(prob):
        if prob >= 0.5:
            return str(round(-prob / (1 - prob) * 100))
        return "+" + str(round((1 - prob) / prob * 100))

    game.odds_line = f"{team_names[0]} {_ml(prob0)} ({round(prob0*100)}%) | {team_names[1]} {_ml(prob1)} ({round(prob1*100)}%)"


# =============================================================================
# Game CRUD
# =============================================================================

@router.get("", response_model=list[GameResponse])
async def list_games(
    run_id: int,
    status_filter: str | None = None,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """List all games for this run, optionally filtered by status."""
    query = select(Game).where(Game.run_id == run_id).order_by(Game.game_date.desc())
    if status_filter:
        query = query.where(Game.status == status_filter)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=GameResponse, status_code=status.HTTP_201_CREATED)
async def create_game(
    run_id: int,
    data: GameCreate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_run_admin()),
):
    """Create a new game in this run (run admin only).

    Notifies all regular and drop-in members about the new game.
    """
    game = Game(run_id=run_id, **data.model_dump())
    db.add(game)
    await db.flush()
    await db.refresh(game, ["rsvps", "teams", "result"])

    # Notify all active run members (regular + drop-in)
    members_result = await db.execute(
        select(User)
        .join(RunMembership, RunMembership.user_id == User.id)
        .where(
            RunMembership.run_id == run_id,
            RunMembership.player_status.in_([PlayerStatus.REGULAR, PlayerStatus.DROPIN]),
            User.is_active == True,
        )
    )
    members = members_result.scalars().all()

    if members:
        game_date_str = game.game_date.strftime("%A, %B %d at %I:%M %p") if game.game_date else "TBD"
        await send_bulk_notification(
            db=db,
            users=members,
            notification_type=NotificationType.GAME_INVITE,
            title=f"New Game: {game.title}",
            message=f"A new game has been scheduled for {game_date_str} at {game.location}. RSVP now!",
            run_id=run_id,
            action_url=f"/games/{game.id}",
        )

    return game


@router.post("/generate-season")
async def generate_season_games(
    run_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_run_admin()),
):
    """Generate all games for the season based on the run's schedule and date range.

    Requires the run to have default_game_day, default_game_time, start_date, and end_date set.
    Skips dates that already have a game to prevent duplicates.
    """
    result = await db.execute(select(Run).where(Run.id == run_id))
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    # Validate required schedule fields
    missing = []
    if run.default_game_day is None:
        missing.append("schedule day")
    if not run.default_game_time:
        missing.append("game time")
    if not run.start_date:
        missing.append("start date")
    if not run.end_date:
        missing.append("end date")
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot generate games. Missing: {', '.join(missing)}. Update these in Run Settings.",
        )

    if run.end_date <= run.start_date:
        raise HTTPException(status_code=400, detail="End date must be after start date")

    # Parse game time
    try:
        hour, minute = map(int, run.default_game_time.split(":"))
    except (ValueError, AttributeError):
        raise HTTPException(status_code=400, detail=f"Invalid game time format: {run.default_game_time}")

    # Get existing game dates for this run to skip duplicates
    existing_result = await db.execute(
        select(Game.game_date).where(Game.run_id == run_id)
    )
    existing_dates = set()
    for row in existing_result.all():
        dt = row[0]
        if hasattr(dt, "date"):
            existing_dates.add(dt.date())
        elif isinstance(dt, str):
            from datetime import date as date_type
            existing_dates.add(date_type.fromisoformat(dt[:10]))
        else:
            existing_dates.add(dt)

    # Iterate from start_date to end_date, finding every matching weekday
    current = run.start_date
    if isinstance(current, datetime):
        current = current.date()
    end = run.end_date
    if isinstance(end, datetime):
        end = end.date()

    # Advance to the first matching weekday
    target_weekday = run.default_game_day  # 0=Monday
    while current.weekday() != target_weekday and current <= end:
        current += timedelta(days=1)

    created_dates = []
    week_num = 1
    while current <= end:
        if current not in existing_dates:
            game_dt = datetime(current.year, current.month, current.day, hour, minute)
            day_name = current.strftime("%A")
            month_day = current.strftime("%b %d")
            game = Game(
                run_id=run_id,
                title=f"Week {week_num} - {day_name} {month_day}",
                game_date=game_dt,
                location=run.default_location or "TBD",
                roster_size=run.default_roster_size,
                num_teams=run.default_num_teams,
                status=GameStatus.SCHEDULED,
            )
            db.add(game)
            created_dates.append(current.isoformat())
        week_num += 1
        current += timedelta(weeks=1)

    await db.flush()

    return {
        "games_created": len(created_dates),
        "total_weeks": week_num - 1,
        "dates": created_dates,
    }


@router.get("/{game_id}", response_model=GameDetailResponse)
async def get_game(
    run_id: int,
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
    if game.run_id != run_id:
        raise HTTPException(status_code=404, detail="Game not found in this run")
    return game


@router.patch("/{game_id}", response_model=GameResponse)
async def update_game(
    run_id: int,
    game_id: int,
    data: GameUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_run_admin()),
):
    """Update game details (run admin only).

    Notifies all RSVPed players when time, date, or location changes.
    """
    result = await db.execute(
        select(Game).where(Game.id == game_id).options(selectinload(Game.rsvps))
    )
    game = result.scalar_one_or_none()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    if game.run_id != run_id:
        raise HTTPException(status_code=404, detail="Game not found in this run")

    update_fields = data.model_dump(exclude_unset=True)
    old_status = game.status

    # Track meaningful changes that players should know about
    changes = []
    if "game_date" in update_fields and str(update_fields["game_date"]) != str(game.game_date):
        changes.append("date/time")
    if "location" in update_fields and update_fields["location"] != game.location:
        changes.append("location")

    for field, value in update_fields.items():
        setattr(game, field, value)

    # If moving away from completed, clear results and commentary
    new_status = update_fields.get("status")
    if new_status and old_status == GameStatus.COMPLETED and GameStatus(new_status) != GameStatus.COMPLETED:
        # Delete game result and team scores
        existing_result = await db.execute(select(GameResult).where(GameResult.game_id == game_id))
        game_result = existing_result.scalar_one_or_none()
        if game_result:
            await db.execute(delete(TeamScore).where(TeamScore.game_result_id == game_result.id))
            await db.execute(delete(GameResult).where(GameResult.id == game_result.id))
        game.commentary = None
        game.odds_line = None
        # Recalculate stats since a completed game lost its results
        from app.services.stats_recalc import recalculate_run_stats
        await recalculate_run_stats(db, run_id)

    # If moving backwards from teams_set, clear team assignments
    if new_status and old_status == GameStatus.TEAMS_SET and GameStatus(new_status) in (
        GameStatus.SCHEDULED, GameStatus.INVITES_SENT, GameStatus.DROPIN_OPEN,
    ):
        await db.execute(delete(TeamAssignment).where(TeamAssignment.game_id == game_id))
        game.odds_line = None

    # Auto-promote waitlisted drop-ins when status changes to DROPIN_OPEN
    if new_status and new_status != old_status.value and GameStatus(new_status) == GameStatus.DROPIN_OPEN:
        from app.services.dropin_promotion import promote_waitlisted_dropins
        await promote_waitlisted_dropins(db, game)

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
                action_url=f"/games/{game.id}",
            )

    await db.flush()
    return game


# =============================================================================
# Cancel Game
# =============================================================================

@router.post("/{game_id}/cancel", response_model=GameResponse)
async def cancel_game(
    run_id: int,
    game_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_run_admin()),
):
    """Cancel a game and notify all RSVPed players (run admin only).

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
    if game.run_id != run_id:
        raise HTTPException(status_code=404, detail="Game not found in this run")

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
# Skip Game
# =============================================================================

@router.post("/{game_id}/skip", response_model=GameResponse)
async def skip_game(
    run_id: int,
    game_id: int,
    notes: str | None = None,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_run_admin()),
):
    """Mark a game as skipped (e.g., holiday, weather, not enough players).

    Similar to cancel but indicates a temporary skip rather than permanent cancellation.
    """
    result = await db.execute(
        select(Game).where(Game.id == game_id).options(selectinload(Game.rsvps))
    )
    game = result.scalar_one_or_none()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    if game.run_id != run_id:
        raise HTTPException(status_code=404, detail="Game not found in this run")

    if game.status in (GameStatus.COMPLETED, GameStatus.CANCELLED, GameStatus.SKIPPED):
        raise HTTPException(status_code=400, detail=f"Cannot skip a {game.status.value} game")

    game.status = GameStatus.SKIPPED
    if notes:
        game.notes = notes

    # Notify RSVPed players
    notifiable_rsvps = [
        r for r in game.rsvps
        if r.status in (RSVPStatus.ACCEPTED, RSVPStatus.WAITLIST, RSVPStatus.PENDING)
    ]
    if notifiable_rsvps:
        player_ids = [r.user_id for r in notifiable_rsvps]
        players_result = await db.execute(select(User).where(User.id.in_(player_ids)))
        players = list(players_result.scalars().all())

        skip_msg = f"This week's game ({game.title}) has been skipped."
        if notes:
            skip_msg += f" Reason: {notes}"

        await send_bulk_notification(
            db,
            players,
            NotificationType.GAME_CANCELLED,
            f"Game Skipped: {game.title}",
            skip_msg,
            run_id=run_id,
        )

    await db.flush()
    return game


# =============================================================================
# Delete Game
# =============================================================================

@router.delete("/{game_id}", status_code=204)
async def delete_game(
    run_id: int,
    game_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_run_admin()),
):
    """Permanently delete a game and all associated data (run admin only)."""
    from app.models.vote import GameVote
    from app.models.notification import Notification

    result = await db.execute(
        select(Game).where(Game.id == game_id).options(
            selectinload(Game.rsvps),
            selectinload(Game.teams),
            selectinload(Game.result).selectinload(GameResult.team_scores),
        )
    )
    game = result.scalar_one_or_none()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    if game.run_id != run_id:
        raise HTTPException(status_code=404, detail="Game not found in this run")

    # Delete all associated data
    await db.execute(delete(GameVote).where(GameVote.game_id == game_id))
    await db.execute(delete(Notification).where(Notification.action_url == f"/games/{game_id}"))
    for rsvp in game.rsvps:
        await db.delete(rsvp)
    for team in game.teams:
        await db.delete(team)
    if game.result:
        await db.execute(delete(TeamScore).where(TeamScore.game_result_id == game.result.id))
        await db.delete(game.result)

    was_completed = game.status == GameStatus.COMPLETED

    await db.delete(game)
    await db.flush()

    # Recalculate stats if a completed game was deleted
    if was_completed:
        from app.services.stats_recalc import recalculate_run_stats
        await recalculate_run_stats(db, run_id)


# =============================================================================
# RSVP Management
# =============================================================================

@router.post("/{game_id}/poke")
async def poke_players(
    run_id: int,
    game_id: int,
    data: dict | None = None,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_run_admin()),
):
    """Send RSVP reminder to players who haven't responded (admin only).

    Body options:
    - { "user_ids": [1, 2, 3] } — specific players
    - { "scope": "regulars" } — all non-responding regulars (default)
    - { "scope": "all" } — all non-responding regulars + drop-ins
    """
    game_result = await db.execute(
        select(Game).where(Game.id == game_id).options(selectinload(Game.rsvps))
    )
    game = game_result.scalar_one_or_none()
    if not game or game.run_id != run_id:
        raise HTTPException(status_code=404, detail="Game not found in this run")

    # Find who has already RSVPed
    responded_ids = {r.user_id for r in game.rsvps}

    # Get target players
    target_ids = data.get("user_ids") if data else None
    scope = data.get("scope", "regulars") if data else "regulars"

    if target_ids:
        # Specific players
        users_result = await db.execute(
            select(User).where(User.id.in_(target_ids))
        )
    else:
        # Filter by scope
        statuses = [PlayerStatus.REGULAR]
        if scope == "all":
            statuses.append(PlayerStatus.DROPIN)

        members_result = await db.execute(
            select(RunMembership).where(
                RunMembership.run_id == run_id,
                RunMembership.player_status.in_(statuses),
            )
        )
        member_ids = [m.user_id for m in members_result.scalars().all() if m.user_id not in responded_ids]
        if not member_ids:
            label = "regulars and drop-ins" if scope == "all" else "regulars"
            return {"poked": 0, "message": f"All {label} have already responded"}
        users_result = await db.execute(
            select(User).where(User.id.in_(member_ids))
        )

    players = list(users_result.scalars().all())
    if not players:
        return {"poked": 0, "message": "No players to remind"}

    await send_bulk_notification(
        db,
        players,
        NotificationType.RSVP_REMINDER,
        f"RSVP Reminder: {game.title}",
        f"Hey! The admin is checking in — are you playing {game.title}? Let them know!",
        action_url=f"/games/{game.id}",
    )

    return {"poked": len(players), "message": f"Reminded {len(players)} player(s)"}


@router.post("/{game_id}/rsvp", response_model=RSVPResponse)
async def rsvp_to_game(
    run_id: int,
    game_id: int,
    data: RSVPCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """RSVP to a game.

    TEACHING NOTE:
        Business rules enforced here:
        - Only approved run members (regular or dropin) can RSVP
        - Regular players can RSVP anytime before the deadline
        - Drop-in players can only RSVP when status is DROPIN_OPEN
        - If the game is full, drop-in players go on the waitlist
        - First-come-first-served for drop-in spots
    """
    # Verify game exists and belongs to this run
    result = await db.execute(select(Game).where(Game.id == game_id))
    game = result.scalar_one_or_none()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    if game.run_id != run_id:
        raise HTTPException(status_code=404, detail="Game not found in this run")

    # Block RSVP for games that are no longer active
    if game.status in (GameStatus.COMPLETED, GameStatus.CANCELLED, GameStatus.SKIPPED):
        raise HTTPException(status_code=400, detail="Cannot RSVP to this game")

    # Check the user's RunMembership status for this run
    membership_result = await db.execute(
        select(RunMembership).where(
            RunMembership.run_id == run_id,
            RunMembership.user_id == user.id,
        )
    )
    membership = membership_result.scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=403, detail="You are not a member of this run")

    if membership.player_status == PlayerStatus.PENDING:
        raise HTTPException(status_code=403, detail="Your registration is pending approval")
    if membership.player_status == PlayerStatus.INACTIVE:
        raise HTTPException(status_code=403, detail="Your account is inactive")

    # Drop-in players: allowed to RSVP during INVITES_SENT or DROPIN_OPEN
    # but go to waitlist if game isn't in DROPIN_OPEN yet or spots are full
    is_dropin = membership.player_status == PlayerStatus.DROPIN
    if is_dropin:
        if game.status not in (GameStatus.DROPIN_OPEN, GameStatus.INVITES_SENT):
            raise HTTPException(status_code=403, detail="Drop-in spots are not yet available")

    # Check for existing RSVP
    existing = await db.execute(
        select(RSVP).where(RSVP.game_id == game_id, RSVP.user_id == user.id)
    )
    rsvp = existing.scalar_one_or_none()

    rsvp_status = RSVPStatus(data.status)

    # Waitlist rules:
    # - Regulars: accepted if spots available, waitlist if full
    # - Drop-ins before DROPIN_OPEN: always waitlist
    # - Drop-ins during DROPIN_OPEN: accepted if spots available, waitlist if full
    if rsvp_status == RSVPStatus.ACCEPTED:
        if is_dropin and game.status != GameStatus.DROPIN_OPEN:
            rsvp_status = RSVPStatus.WAITLIST
        elif game.spots_remaining <= 0:
            rsvp_status = RSVPStatus.WAITLIST

    was_accepted = rsvp.status == RSVPStatus.ACCEPTED if rsvp else False

    if rsvp:
        rsvp.status = rsvp_status
        rsvp.responded_at = datetime.utcnow()
    else:
        rsvp = RSVP(
            game_id=game_id,
            user_id=user.id,
            status=rsvp_status,
            responded_at=datetime.utcnow(),
        )
        db.add(rsvp)

    await db.flush()

    # If a player changed from accepted to declined, promote next waitlisted
    # Only auto-promote if drop-ins are open (DROPIN_OPEN or TEAMS_SET)
    if was_accepted and rsvp_status == RSVPStatus.DECLINED:
        if game.status in (GameStatus.DROPIN_OPEN, GameStatus.TEAMS_SET):
            from app.services.dropin_promotion import promote_waitlisted_dropins
            await db.refresh(game)
            await promote_waitlisted_dropins(db, game, max_promote=1)

    # Auto-regenerate teams if a new player accepted after teams were set
    if game.status == GameStatus.TEAMS_SET and rsvp_status == RSVPStatus.ACCEPTED and not was_accepted:
        run_result = await db.execute(select(Run).where(Run.id == run_id))
        run = run_result.scalar_one_or_none()
        if run and run.auto_regen_teams:
            from app.services.scheduler import _generate_teams_for_game
            await db.refresh(game)
            await _generate_teams_for_game(db, game)
            logger.info(f"Auto-regenerated teams for game {game_id} after new player accepted")

            # Notify run admins
            from app.models.run import RunAdmin
            admin_result = await db.execute(select(RunAdmin).where(RunAdmin.run_id == run_id))
            admin_ids = [ra.user_id for ra in admin_result.scalars().all()]
            super_result = await db.execute(select(User).where(User.role == UserRole.SUPER_ADMIN))
            for sa in super_result.scalars().all():
                if sa.id not in admin_ids:
                    admin_ids.append(sa.id)
            if admin_ids:
                admins_result = await db.execute(select(User).where(User.id.in_(admin_ids)))
                admin_users = list(admins_result.scalars().all())
                player_name = user.full_name
                await send_bulk_notification(
                    db, admin_users, NotificationType.TEAMS_PUBLISHED,
                    f"Teams Auto-Regenerated: {game.title}",
                    f"{player_name} accepted after teams were set. Teams have been automatically rebalanced.",
                    action_url=f"/games/{game_id}",
                )

    return rsvp


@router.get("/{game_id}/rsvps", response_model=list[RSVPResponse])
async def get_game_rsvps(
    run_id: int,
    game_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Get all RSVPs for a game."""
    # Verify game belongs to this run
    game_result = await db.execute(select(Game).where(Game.id == game_id))
    game = game_result.scalar_one_or_none()
    if not game or game.run_id != run_id:
        raise HTTPException(status_code=404, detail="Game not found in this run")

    result = await db.execute(
        select(RSVP)
        .where(RSVP.game_id == game_id)
        .options(selectinload(RSVP.user))
        .order_by(RSVP.responded_at)
    )
    return result.scalars().all()


@router.post("/{game_id}/rsvp/admin", response_model=RSVPResponse)
async def admin_rsvp(
    run_id: int,
    game_id: int,
    data: AdminRSVPCreate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_run_admin()),
):
    """RSVP on behalf of a player (admin only). No status restrictions."""
    game_result = await db.execute(select(Game).where(Game.id == game_id))
    game = game_result.scalar_one_or_none()
    if not game or game.run_id != run_id:
        raise HTTPException(status_code=404, detail="Game not found in this run")

    # Verify user is a run member
    membership = await db.execute(
        select(RunMembership).where(
            RunMembership.run_id == run_id,
            RunMembership.user_id == data.user_id,
        )
    )
    if not membership.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Player is not a member of this run")

    rsvp_status = RSVPStatus(data.status)

    existing = await db.execute(
        select(RSVP).where(RSVP.game_id == game_id, RSVP.user_id == data.user_id)
    )
    rsvp = existing.scalar_one_or_none()

    if rsvp:
        rsvp.status = rsvp_status
        rsvp.responded_at = datetime.utcnow()
    else:
        rsvp = RSVP(
            game_id=game_id,
            user_id=data.user_id,
            status=rsvp_status,
            responded_at=datetime.utcnow(),
        )
        db.add(rsvp)

    await db.flush()
    await db.refresh(rsvp, ["user"])
    return rsvp


# =============================================================================
# Team Management
# =============================================================================

@router.post("/{game_id}/teams", response_model=list[TeamAssignmentResponse])
async def generate_teams(
    run_id: int,
    game_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_run_admin()),
):
    """Generate balanced teams for a game (run admin only).

    TEACHING NOTE:
        This endpoint triggers the team balancing algorithm. It:
        1. Gets all accepted RSVPs
        2. Fetches each player's ratings and stats
        3. Runs the balancing algorithm for N teams
        4. Assigns random fun team names
        5. Stores team assignments
        6. Updates the game status to TEAMS_SET

        Algorithm weights and custom metrics are loaded per-run.
    """
    result = await db.execute(
        select(Game).where(Game.id == game_id).options(selectinload(Game.rsvps))
    )
    game = result.scalar_one_or_none()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    if game.run_id != run_id:
        raise HTTPException(status_code=404, detail="Game not found in this run")

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

    # Load algorithm weights from DB scoped to this run (falls back to defaults if empty)
    weights_result = await db.execute(
        select(AlgorithmWeight).where(AlgorithmWeight.run_id == run_id)
    )
    db_weights = weights_result.scalars().all()
    weights = {w.metric_name: w.weight for w in db_weights} if db_weights else None

    # Load custom metric definitions scoped to this run
    cm_result = await db.execute(
        select(CustomMetric).where(CustomMetric.run_id == run_id)
    )
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

    await db.flush()
    await _recalculate_odds(game, db)

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
        action_url=f"/games/{game.id}",
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
    run_id: int,
    game_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Get team assignments for a game."""
    # Verify game belongs to this run
    game_result = await db.execute(select(Game).where(Game.id == game_id))
    game = game_result.scalar_one_or_none()
    if not game or game.run_id != run_id:
        raise HTTPException(status_code=404, detail="Game not found in this run")

    result = await db.execute(
        select(TeamAssignment)
        .where(TeamAssignment.game_id == game_id)
        .options(selectinload(TeamAssignment.user))
    )
    return result.scalars().all()


# =============================================================================
# Team Editing (post-generation, pre-result)
# =============================================================================

async def _get_game_for_team_edit(db: AsyncSession, run_id: int, game_id: int) -> Game:
    """Validate game exists, belongs to run, and is in teams_set status."""
    game_result = await db.execute(select(Game).where(Game.id == game_id))
    game = game_result.scalar_one_or_none()
    if not game or game.run_id != run_id:
        raise HTTPException(status_code=404, detail="Game not found in this run")
    if game.status != GameStatus.TEAMS_SET:
        raise HTTPException(status_code=400, detail="Teams can only be edited while game status is 'teams_set'")
    return game


@router.patch("/{game_id}/teams/{assignment_id}", response_model=TeamAssignmentResponse)
async def move_team_assignment(
    run_id: int,
    game_id: int,
    assignment_id: int,
    data: TeamAssignmentUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_run_admin()),
):
    """Move a player to a different team (admin only, teams_set status)."""
    game = await _get_game_for_team_edit(db, run_id, game_id)

    assign_result = await db.execute(
        select(TeamAssignment)
        .where(TeamAssignment.id == assignment_id, TeamAssignment.game_id == game_id)
        .options(selectinload(TeamAssignment.user))
    )
    assignment = assign_result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Team assignment not found")

    if assignment.team == data.team:
        raise HTTPException(status_code=400, detail="Player is already on that team")

    teams_result = await db.execute(
        select(TeamAssignment.team, TeamAssignment.team_name)
        .where(TeamAssignment.game_id == game_id)
        .distinct()
    )
    valid_teams = {row.team: row.team_name for row in teams_result.all()}
    if data.team not in valid_teams:
        raise HTTPException(status_code=400, detail=f"Team '{data.team}' does not exist in this game")

    assignment.team = data.team
    assignment.team_name = valid_teams[data.team]
    await db.flush()
    await _recalculate_odds(game, db)
    await db.flush()
    await db.refresh(assignment, ["user"])
    return assignment


@router.delete("/{game_id}/teams/{assignment_id}", status_code=204)
async def remove_team_assignment(
    run_id: int,
    game_id: int,
    assignment_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_run_admin()),
):
    """Remove a player from a team — marks them as a no-show (admin only)."""
    game = await _get_game_for_team_edit(db, run_id, game_id)

    assign_result = await db.execute(
        select(TeamAssignment).where(TeamAssignment.id == assignment_id, TeamAssignment.game_id == game_id)
    )
    assignment = assign_result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Team assignment not found")

    count_result = await db.execute(
        select(sqlfunc.count()).where(
            TeamAssignment.game_id == game_id,
            TeamAssignment.team == assignment.team,
        )
    )
    if count_result.scalar() <= 1:
        raise HTTPException(status_code=400, detail="Cannot remove the last player from a team")

    await db.delete(assignment)
    await db.flush()
    await _recalculate_odds(game, db)
    await db.flush()


@router.post("/{game_id}/teams/add", response_model=TeamAssignmentResponse, status_code=201)
async def add_team_assignment(
    run_id: int,
    game_id: int,
    data: TeamAddPlayerRequest,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_run_admin()),
):
    """Add a player to a team (admin only, teams_set status)."""
    game = await _get_game_for_team_edit(db, run_id, game_id)

    teams_result = await db.execute(
        select(TeamAssignment.team, TeamAssignment.team_name)
        .where(TeamAssignment.game_id == game_id)
        .distinct()
    )
    valid_teams = {row.team: row.team_name for row in teams_result.all()}
    if data.team not in valid_teams:
        raise HTTPException(status_code=400, detail=f"Team '{data.team}' does not exist in this game")

    membership_result = await db.execute(
        select(RunMembership).where(
            RunMembership.run_id == run_id,
            RunMembership.user_id == data.user_id,
            RunMembership.player_status.in_([PlayerStatus.REGULAR, PlayerStatus.DROPIN]),
        )
    )
    if not membership_result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Player is not an active member of this run")

    existing = await db.execute(
        select(TeamAssignment).where(
            TeamAssignment.game_id == game_id,
            TeamAssignment.user_id == data.user_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Player is already assigned to a team in this game")

    new_assignment = TeamAssignment(
        game_id=game_id,
        user_id=data.user_id,
        team=data.team,
        team_name=valid_teams[data.team],
    )
    db.add(new_assignment)
    await db.flush()
    await _recalculate_odds(game, db)
    await db.flush()
    await db.refresh(new_assignment, ["user"])
    return new_assignment


# =============================================================================
# Game Results
# =============================================================================

@router.post("/{game_id}/result", response_model=GameResultResponse, status_code=status.HTTP_201_CREATED)
async def record_result(
    run_id: int,
    game_id: int,
    data: GameResultCreate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_run_admin()),
):
    """Record the outcome of a game night with per-team scores (run admin only).

    TEACHING NOTE:
        A game night typically consists of multiple individual games (e.g.,
        best of 5). The admin enters the win count for each team.

        Example: Team A won 3 games, Team B won 2 games.
        Total individual games = 3 + 2 = 5.
        Team A players: games_played += 5, games_won += 3
        Team B players: games_played += 5, games_won += 2

        The Win Rate (games_won / games_played) is now more granular
        than the old binary system, giving a truer picture of performance.

        Both global User stats and per-run RunPlayerStats are updated.
    """
    # Verify game exists and belongs to this run
    result = await db.execute(
        select(Game).where(Game.id == game_id).options(selectinload(Game.teams))
    )
    game = result.scalar_one_or_none()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    if game.run_id != run_id:
        raise HTTPException(status_code=404, detail="Game not found in this run")

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

    # Update Win Rate for all players (global User stats + per-run RunPlayerStats)
    for assignment in game.teams:
        player_result = await db.execute(select(User).where(User.id == assignment.user_id))
        player = player_result.scalar_one_or_none()
        if player:
            team_wins = score_map.get(assignment.team, 0)

            # Update global User stats
            player.games_played += total_games
            player.games_won += team_wins
            player.win_rate = player.games_won / player.games_played if player.games_played > 0 else 0.5

            # Update per-run RunPlayerStats
            rps_result = await db.execute(
                select(RunPlayerStats).where(
                    RunPlayerStats.run_id == run_id,
                    RunPlayerStats.user_id == player.id,
                )
            )
            run_stats = rps_result.scalar_one_or_none()
            if not run_stats:
                run_stats = RunPlayerStats(
                    run_id=run_id,
                    user_id=player.id,
                    games_played=0,
                    games_won=0,
                )
                db.add(run_stats)

            run_stats.games_played += total_games
            run_stats.games_won += team_wins
            run_stats.win_rate = run_stats.games_won / run_stats.games_played if run_stats.games_played > 0 else 0.5

    game.status = GameStatus.COMPLETED

    # Build fun commentary from admin seed + game data
    game.commentary = await _build_commentary(
        seed=data.commentary,
        score_map=score_map,
        team_name_lookup=team_name_lookup,
        game=game,
        total_games=total_games,
    )

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
        f"{winner_msg} Final: {score_summary}. Player award voting is now open — cast your MVP and Shaqtin' votes!",
        action_url=f"/games/{game_id}",
    )

    await db.flush()

    # Reload to get team_scores relationship populated
    result = await db.execute(
        select(GameResult).where(GameResult.id == game_result.id)
        .options(selectinload(GameResult.team_scores))
    )
    return result.scalar_one()
