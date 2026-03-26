"""
Game Scheduler
==============
Automated tasks that run on a schedule to manage the game lifecycle.

TEACHING NOTE:
    This module defines the recurring jobs that drive the weekly flow:

    1. WEEKLY GAME CREATION (runs daily at 6 PM):
       Iterates over all active Runs.  For each run whose default_game_day
       matches the upcoming week, creates next week's game and sends
       invites to REGULAR members of that run.

    2. DROP-IN NOTIFICATION (runs daily at 8 AM):
       Finds today's games across all runs.  For each game with open
       spots, notifies DROPIN members of that game's run.

    3. TEAM CREATION (runs every 15 minutes):
       Runs the balancing algorithm and publishes teams.

    4. VOTING REMINDERS (runs 9 AM daily):
       Reminds players who haven't voted to cast their MVP and Shaqtin'
       votes before the noon deadline.

    5. AWARD ANNOUNCEMENTS (runs every 30 minutes):
       Checks for games whose voting window has closed (noon day after)
       and announces winners with top 10 standings and fun commentary.
       Updates both RunPlayerStats and global User stats.

    We use APScheduler for simplicity in development. In production,
    you'd want Celery Beat or a similar distributed scheduler that
    can handle multiple server instances without duplicate jobs.
"""

import logging
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select

from app.config import settings
from app.database import async_session
from app.models.game import Game, GameStatus, RSVP, RSVPStatus
from app.models.notification import NotificationType
from app.models.user import PlayerStatus, User
from app.models.run import Run, RunMembership, RunPlayerStats
from app.services.notification_service import send_bulk_notification, send_notification
from app.models.algorithm_config import AlgorithmWeight, CustomMetric, PlayerCustomMetric
from app.models.team import TeamAssignment, GameResult, TeamScore, pick_team_names
from app.services.team_balancer import CustomMetricDef, create_balanced_teams
from app.models.vote import GameVote, VoteType

import random

logger = logging.getLogger(__name__)

# Global scheduler instance
scheduler = AsyncIOScheduler()


def setup_scheduler():
    """Configure and start the background job scheduler.

    TEACHING NOTE:
        Because different runs can have different game days, the
        scheduler now runs create_weekly_game and open_dropin_spots
        daily and lets each job figure out which runs need attention.
    """
    # Auto-send invites for upcoming games (checks every 30 minutes)
    scheduler.add_job(
        send_game_invites,
        "interval",
        minutes=30,
        id="send_game_invites",
        replace_existing=True,
    )

    # Open drop-in spots (checks every 30 minutes)
    scheduler.add_job(
        open_dropin_spots,
        "interval",
        minutes=30,
        id="open_dropin_spots",
        replace_existing=True,
    )

    # Check every 15 minutes for games needing auto team generation
    # (triggers 1 hour before game time if admin hasn't already set teams)
    scheduler.add_job(
        generate_and_publish_teams,
        "interval",
        minutes=15,
        id="generate_teams",
        replace_existing=True,
    )

    # Send voting reminders at 9 AM every day (catches morning after game)
    scheduler.add_job(
        send_voting_reminders,
        "cron",
        hour=9,
        minute=0,
        id="voting_reminders",
        replace_existing=True,
    )

    # Check for closed voting windows and announce awards (every 30 minutes)
    scheduler.add_job(
        announce_awards,
        "interval",
        minutes=30,
        id="announce_awards",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("Scheduler started with daily game jobs (multi-run)")


# =============================================================================
# Scheduled Jobs
# =============================================================================

async def send_game_invites():
    """Auto-send invites for scheduled games within the invite window.

    For each active run with invite_hours_before configured, finds
    SCHEDULED games whose game_date is within the invite window
    and transitions them to INVITES_SENT, notifying all regular players.
    """
    logger.info("Checking for games needing invites...")

    async with async_session() as db:
        try:
            now = datetime.utcnow()

            # Get active runs with auto-invite configured
            runs_result = await db.execute(
                select(Run).where(Run.is_active == True, Run.invite_hours_before.isnot(None))
            )
            runs = runs_result.scalars().all()

            for run in runs:
                invite_window = now + timedelta(hours=run.invite_hours_before)

                # Find SCHEDULED games within the invite window
                games_result = await db.execute(
                    select(Game).where(
                        Game.run_id == run.id,
                        Game.status == GameStatus.SCHEDULED,
                        Game.game_date <= invite_window,
                        Game.game_date > now,
                    )
                )
                games = games_result.scalars().all()

                for game in games:
                    # Transition to INVITES_SENT
                    game.status = GameStatus.INVITES_SENT

                    # Get all REGULAR members
                    members_result = await db.execute(
                        select(RunMembership).where(
                            RunMembership.run_id == run.id,
                            RunMembership.player_status == PlayerStatus.REGULAR,
                        )
                    )
                    member_ids = [m.user_id for m in members_result.scalars().all()]

                    if member_ids:
                        players_result = await db.execute(
                            select(User).where(User.id.in_(member_ids), User.is_active == True)
                        )
                        players = list(players_result.scalars().all())

                        for player in players:
                            await send_notification(
                                db, player, NotificationType.GAME_INVITE,
                                f"Game Invite: {game.title}",
                                f"You're invited to play on {game.game_date.strftime('%A, %B %d at %I:%M %p')}. "
                                f"RSVP now to secure your spot!",
                                run_id=run.id,
                                action_url=f"/games/{game.id}",
                            )

                        logger.info(f"Sent invites for game {game.id} ({game.title}) to {len(players)} players")

            await db.commit()

        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to send game invites: {e}")


async def open_dropin_spots():
    """Open drop-in spots for games based on each run's dropin_open_hours_before setting.

    Runs every 15 minutes. For each game with INVITES_SENT status:
    1. Check if game_date - dropin_open_hours_before has passed
    2. If so, change status to DROPIN_OPEN
    3. Auto-promote waitlisted drop-ins to fill available spots
    4. Notify remaining drop-in members about open spots

    Runs with dropin_open_hours_before = NULL never auto-open.
    """
    logger.info("Checking for drop-in spots across all runs...")

    async with async_session() as db:
        try:
            now = datetime.utcnow()

            # Find all games with INVITES_SENT status that have runs configured for auto-open
            result = await db.execute(
                select(Game)
                .join(Run, Game.run_id == Run.id)
                .where(
                    Game.status == GameStatus.INVITES_SENT,
                    Run.dropin_open_hours_before.isnot(None),
                )
            )
            games = result.scalars().all()

            if not games:
                logger.info("No games found needing drop-in openings")
                return

            for game in games:
                # Get the run's dropin_open_hours_before
                run_result = await db.execute(select(Run).where(Run.id == game.run_id))
                run = run_result.scalar_one()
                hours_before = run.dropin_open_hours_before

                # Check if it's time to open
                from datetime import timedelta
                open_at = game.game_date - timedelta(hours=hours_before)
                if now < open_at:
                    continue

                spots = game.spots_remaining
                if spots <= 0:
                    logger.info(f"Game {game.id} is full, no drop-in spots available")
                    continue

                # Update game status
                game.status = GameStatus.DROPIN_OPEN
                await db.flush()

                # Auto-promote waitlisted drop-ins
                from app.services.dropin_promotion import promote_waitlisted_dropins
                await promote_waitlisted_dropins(db, game)

                # Recalculate spots after promotion
                await db.refresh(game)
                spots = game.spots_remaining

                # Notify remaining DROPIN members about open spots
                members_result = await db.execute(
                    select(RunMembership).where(
                        RunMembership.run_id == game.run_id,
                        RunMembership.player_status == PlayerStatus.DROPIN,
                    )
                )
                dropin_memberships = members_result.scalars().all()
                dropin_user_ids = [m.user_id for m in dropin_memberships]

                # Exclude players who already have an RSVP (accepted or otherwise)
                if dropin_user_ids:
                    existing_rsvp_result = await db.execute(
                        select(RSVP.user_id).where(
                            RSVP.game_id == game.id,
                            RSVP.user_id.in_(dropin_user_ids),
                        )
                    )
                    already_rsvped = set(r[0] for r in existing_rsvp_result.all())
                    notify_user_ids = [uid for uid in dropin_user_ids if uid not in already_rsvped]

                    if notify_user_ids and spots > 0:
                        players_result = await db.execute(
                            select(User).where(
                                User.id.in_(notify_user_ids),
                                User.is_active == True,  # noqa: E712
                            )
                        )
                        dropin_players = list(players_result.scalars().all())

                        for player in dropin_players:
                            await send_notification(
                                db, player, NotificationType.DROPIN_AVAILABLE,
                                f"{spots} Spots Available!",
                                f"There are {spots} open spots for {game.title} at "
                                f"{game.game_date.strftime('%I:%M %p')}. "
                                f"Grab your spot before they're gone!",
                                run_id=game.run_id,
                                action_url=f"/games/{game.id}",
                            )

                logger.info(f"Opened drop-in spots for game {game.id} ({spots} remaining)")

            await db.commit()

        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to open drop-in spots: {e}")


async def generate_and_publish_teams():
    """Auto-generate balanced teams 15 minutes before game time.

    TEACHING NOTE:
        This runs every 15 minutes and checks for upcoming games where:
        - The game starts within the next 15 minutes
        - Teams haven't been set yet (status is INVITES_SENT or DROPIN_OPEN)

        This means an admin can manually generate teams at any time before
        the 15-minute window. If they don't, this job handles it automatically.
    """
    logger.info("Checking for games needing auto team generation...")

    async with async_session() as db:
        try:
            now = datetime.utcnow()

            # Get all runs with auto_team_minutes_before configured
            runs_result = await db.execute(
                select(Run).where(Run.auto_team_minutes_before.isnot(None), Run.is_active == True)
            )
            runs = runs_result.scalars().all()

            if not runs:
                logger.info("No runs with auto team generation configured")
                return

            all_games = []
            for run in runs:
                window = now + timedelta(minutes=run.auto_team_minutes_before)
                result = await db.execute(
                    select(Game).where(
                        Game.run_id == run.id,
                        Game.game_date <= window,
                        Game.game_date > now,
                        Game.status.in_([GameStatus.INVITES_SENT, GameStatus.DROPIN_OPEN]),
                    )
                )
                all_games.extend(result.scalars().all())

            if not all_games:
                logger.info("No games need auto team generation")
                return

            for game in all_games:
                await _generate_teams_for_game(db, game)

            await db.commit()

        except Exception as e:
            await db.rollback()
            logger.error(f"Failed in auto team generation check: {e}")


async def _generate_teams_for_game(db, game):
    """Generate balanced teams for a single game and notify players."""
    logger.info(f"Auto-generating teams for game {game.id} ({game.title})...")

    try:
        # Get accepted players
        rsvp_result = await db.execute(
            select(RSVP).where(
                RSVP.game_id == game.id,
                RSVP.status == RSVPStatus.ACCEPTED,
            )
        )
        accepted_rsvps = rsvp_result.scalars().all()
        player_ids = [r.user_id for r in accepted_rsvps]

        if len(player_ids) < game.num_teams:
            logger.info(f"Not enough players for game {game.id}, skipping auto-generation")
            return

        # Fetch full player data
        players_result = await db.execute(select(User).where(User.id.in_(player_ids)))
        players = list(players_result.scalars().all())

        # Load algorithm config from DB, filtered by this game's run_id
        weights_result = await db.execute(
            select(AlgorithmWeight).where(AlgorithmWeight.run_id == game.run_id)
        )
        db_weights = weights_result.scalars().all()
        weights = {w.metric_name: w.weight for w in db_weights} if db_weights else None

        cm_result = await db.execute(
            select(CustomMetric).where(CustomMetric.run_id == game.run_id)
        )
        custom_metrics_db = cm_result.scalars().all()
        custom_metric_defs = [
            CustomMetricDef(
                name=cm.name, min_value=cm.min_value,
                max_value=cm.max_value, default_value=cm.default_value,
            )
            for cm in custom_metrics_db
        ]

        pcm_result = await db.execute(
            select(PlayerCustomMetric).where(PlayerCustomMetric.user_id.in_(player_ids))
        )
        player_custom_values = {}
        for pcm in pcm_result.scalars().all():
            metric = next((cm for cm in custom_metrics_db if cm.id == pcm.metric_id), None)
            if metric:
                player_custom_values.setdefault(pcm.user_id, {})[metric.name] = pcm.value

        # Generate N balanced teams
        balanced_teams = create_balanced_teams(
            players,
            num_teams=game.num_teams,
            weights=weights,
            custom_metrics=custom_metric_defs,
            player_custom_values=player_custom_values,
        )

        # Pick random fun team names
        team_names = pick_team_names(game.num_teams)

        # Save assignments
        all_players_with_teams = []
        for team_idx, team_players in enumerate(balanced_teams):
            team_id = f"team_{team_idx + 1}"
            team_name = team_names[team_idx]
            for player in team_players:
                db.add(TeamAssignment(
                    game_id=game.id,
                    user_id=player.id,
                    team=team_id,
                    team_name=team_name,
                ))
                all_players_with_teams.append((player, team_name))

        game.status = GameStatus.TEAMS_SET

        # Notify all players
        for player, team_name in all_players_with_teams:
            await send_notification(
                db,
                player,
                NotificationType.TEAMS_PUBLISHED,
                "Teams Are Set!",
                f"You're on {team_name} for tonight's game. See you on the court!",
                run_id=game.run_id,
                action_url=f"/games/{game.id}",
            )

        team_summary = " vs ".join(
            f"{team_names[i]} ({len(balanced_teams[i])})" for i in range(game.num_teams)
        )
        logger.info(f"Auto-generated teams for game {game.id}: {team_summary}")

    except Exception as e:
        logger.error(f"Failed to auto-generate teams for game {game.id}: {e}")


async def send_voting_reminders():
    """Remind players to vote the morning after a game (before noon deadline).

    TEACHING NOTE:
        Runs at 9 AM daily. Finds COMPLETED games where:
        - The game was yesterday (voting deadline is noon today)
        - A VOTING_REMINDER notification hasn't been sent yet
        Gives players a 3-hour heads-up before voting closes at noon.
    """
    logger.info("Checking for voting reminders to send...")

    async with async_session() as db:
        try:
            from app.models.notification import Notification

            now = datetime.utcnow()

            result = await db.execute(
                select(Game).where(Game.status == GameStatus.COMPLETED)
            )
            completed_games = result.scalars().all()

            for game in completed_games:
                game_time = game.game_date
                if game_time.tzinfo is None:
                    game_time = game_time.replace(tzinfo=None)

                # Voting deadline is noon the day after
                voting_deadline = (game_time + timedelta(days=1)).replace(
                    hour=12, minute=0, second=0, microsecond=0
                )

                # Only send reminder if voting is still open (before noon)
                if now >= voting_deadline:
                    continue

                # Check if reminder already sent
                existing = await db.execute(
                    select(Notification).where(
                        Notification.type == NotificationType.RSVP_REMINDER,
                        Notification.title.like(f"%Vote Reminder%Game #{game.id}%"),
                    ).limit(1)
                )
                if existing.scalar_one_or_none():
                    continue

                # Get participants who haven't voted yet
                participants_result = await db.execute(
                    select(TeamAssignment).where(TeamAssignment.game_id == game.id)
                )
                participant_ids = [ta.user_id for ta in participants_result.scalars().all()]

                voted_result = await db.execute(
                    select(GameVote.voter_id).where(
                        GameVote.game_id == game.id
                    ).distinct()
                )
                voted_ids = set(r[0] for r in voted_result.all())
                non_voters = [pid for pid in participant_ids if pid not in voted_ids]

                if not non_voters:
                    continue

                players_result = await db.execute(
                    select(User).where(User.id.in_(non_voters))
                )
                players = list(players_result.scalars().all())

                for player in players:
                    await send_notification(
                        db, player, NotificationType.RSVP_REMINDER,
                        f"Vote Reminder - {game.title}",
                        f"Player award voting closes soon! Cast your MVP and Shaqtin' votes. "
                        f"Voting closes at noon today.",
                        run_id=game.run_id,
                        action_url=f"/games/{game.id}",
                    )

                logger.info(f"Sent voting reminders to {len(players)} players for game {game.id}")

            await db.commit()

        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to send voting reminders: {e}")


async def announce_awards():
    """Check for games with closed voting windows and announce winners.

    TEACHING NOTE:
        This runs every hour. It looks for COMPLETED games where:
        - The voting window has closed (24h after game time)
        - Awards haven't been announced yet (no AWARDS_ANNOUNCED notification exists)

        When found, it tallies the votes, determines the MVP and Shaqtin'
        winners, updates both RunPlayerStats and global User stats,
        and notifies all participants.
    """
    logger.info("Checking for award announcements...")

    async with async_session() as db:
        try:
            from app.models.notification import Notification

            now = datetime.utcnow()

            # Find completed games where voting window has closed
            # Build a map of run_id -> voting_deadline_hours
            runs_result = await db.execute(select(Run))
            run_deadline_map = {r.id: r.voting_deadline_hours for r in runs_result.scalars().all()}

            result = await db.execute(
                select(Game).where(Game.status == GameStatus.COMPLETED)
            )
            completed_games = result.scalars().all()

            for game in completed_games:
                deadline_hours = run_deadline_map.get(game.run_id, 16)
                game_time = game.game_date
                if game_time.tzinfo is None:
                    game_time = game_time.replace(tzinfo=None)
                voting_deadline = game_time + timedelta(hours=deadline_hours)

                if now <= voting_deadline:
                    continue  # Voting still open

                # Check if we already announced awards for this game
                existing = await db.execute(
                    select(Notification).where(
                        Notification.type == NotificationType.AWARDS_ANNOUNCED,
                        Notification.title.like(f"%Game #{game.id}%"),
                    ).limit(1)
                )
                if existing.scalar_one_or_none():
                    continue  # Already announced

                # Tally all award votes
                mvp_winner = await _tally_votes(db, game.id, VoteType.MVP)
                shaqtin_winner = await _tally_votes(db, game.id, VoteType.SHAQTIN)
                xfactor_winner = await _tally_votes(db, game.id, VoteType.XFACTOR)

                if not mvp_winner and not shaqtin_winner and not xfactor_winner:
                    logger.info(f"No votes cast for game {game.id}, skipping announcement")
                    continue

                # Increment award counts on winner profiles (both RunPlayerStats and User)
                if mvp_winner:
                    mvp_winner.mvp_count += 1
                    await _increment_run_player_stat(db, game.run_id, mvp_winner.id, "mvp_count")
                if shaqtin_winner:
                    shaqtin_winner.shaqtin_count += 1
                    await _increment_run_player_stat(db, game.run_id, shaqtin_winner.id, "shaqtin_count")
                if xfactor_winner:
                    xfactor_winner.xfactor_count += 1
                    await _increment_run_player_stat(db, game.run_id, xfactor_winner.id, "xfactor_count")

                # Get team names and scores from last night's game
                team_names = await _get_game_team_names(db, game.id)
                commentary = _generate_game_commentary(
                    mvp_winner, shaqtin_winner, xfactor_winner, team_names
                )

                # Build award results
                parts = []
                if mvp_winner:
                    parts.append(f"MVP: {mvp_winner.full_name}")
                if shaqtin_winner:
                    parts.append(f"Shaqtin' a Fool: {shaqtin_winner.full_name}")
                if xfactor_winner:
                    parts.append(f"X Factor: {xfactor_winner.full_name}")
                awards_line = " | ".join(parts)

                # Get top 10 overall standings (global, across all runs)
                top10 = await _get_top10_standings(db)
                standings_lines = []
                for rank, player in enumerate(top10, 1):
                    medal = {1: "\U0001f947", 2: "\U0001f948", 3: "\U0001f949"}.get(rank, f"{rank}.")
                    jf_pct = int((player.jordan_factor or 0.5) * 100)
                    standings_lines.append(
                        f"{medal} {player.full_name} - {jf_pct}% Win Rate ({player.games_won}W-{player.games_played - player.games_won}L)"
                    )
                standings_text = "\n".join(standings_lines)

                message = (
                    f"{commentary}\n\n"
                    f"{awards_line}\n\n"
                    f"--- Top 10 Overall Standings ---\n"
                    f"{standings_text}"
                )

                # Notify all participants
                participants_result = await db.execute(
                    select(TeamAssignment).where(TeamAssignment.game_id == game.id)
                )
                participant_ids = [ta.user_id for ta in participants_result.scalars().all()]
                players_result = await db.execute(
                    select(User).where(User.id.in_(participant_ids))
                )
                players = players_result.scalars().all()

                await send_bulk_notification(
                    db,
                    list(players),
                    NotificationType.AWARDS_ANNOUNCED,
                    f"Awards Announced - {game.title}",
                    message,
                    run_id=game.run_id,
                    action_url=f"/games/{game.id}",
                )

                logger.info(f"Awards announced for game {game.id}: {awards_line}")

            await db.commit()

        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to announce awards: {e}")


# =============================================================================
# Helper Functions
# =============================================================================

async def _increment_run_player_stat(db, run_id: int, user_id: int, stat_field: str):
    """Increment a specific award counter on RunPlayerStats for the given run and user."""
    stats_result = await db.execute(
        select(RunPlayerStats).where(
            RunPlayerStats.run_id == run_id,
            RunPlayerStats.user_id == user_id,
        )
    )
    stats = stats_result.scalar_one_or_none()
    if stats:
        current = getattr(stats, stat_field, 0)
        setattr(stats, stat_field, current + 1)


async def _tally_votes(db, game_id: int, vote_type: VoteType) -> User | None:
    """Find the player with the most votes for a category."""
    from sqlalchemy import func as sqlfunc

    result = await db.execute(
        select(
            GameVote.nominee_id,
            sqlfunc.count(GameVote.id).label("cnt"),
        )
        .where(
            GameVote.game_id == game_id,
            GameVote.vote_type == vote_type,
        )
        .group_by(GameVote.nominee_id)
        .order_by(sqlfunc.count(GameVote.id).desc())
        .limit(1)
    )
    row = result.one_or_none()
    if not row:
        return None

    nominee_id = row[0]
    user_result = await db.execute(select(User).where(User.id == nominee_id))
    return user_result.scalar_one_or_none()


async def _get_game_team_names(db, game_id: int) -> dict[str, str]:
    """Get team names and scores for a game. Returns {team_name: wins}."""
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(GameResult).where(GameResult.game_id == game_id)
        .options(selectinload(GameResult.team_scores))
    )
    game_result = result.scalar_one_or_none()
    if not game_result:
        # Fall back to team assignments if no result recorded
        ta_result = await db.execute(
            select(TeamAssignment.team_name).where(
                TeamAssignment.game_id == game_id
            ).distinct()
        )
        return {name: "0" for (name,) in ta_result.all()}

    return {ts.team_name: str(ts.wins) for ts in game_result.team_scores}


async def _get_top10_standings(db) -> list[User]:
    """Get top 10 players by Win Rate (must have played at least 1 game).

    TEACHING NOTE:
        This remains global (across all runs), using User-level cached stats.
    """
    result = await db.execute(
        select(User)
        .where(User.games_played > 0, User.is_active == True)  # noqa: E712
        .order_by(User.jordan_factor.desc(), User.games_won.desc())
        .limit(10)
    )
    return list(result.scalars().all())


# Commentary templates referencing team names and players
_COMMENTARY_TEMPLATES = [
    "What a night! {winner_team} showed up and showed out. {mvp} was absolutely unstoppable — someone check if they're secretly a pro. {xfactor_line}Meanwhile {shaqtin} provided the comedy relief we didn't know we needed.",
    "Last night's battle between {teams} was one for the books. {mvp} put on a clinic that had everyone's jaws on the floor. {xfactor_line}As for {shaqtin}... let's just say the highlights and lowlights were equally entertaining.",
    "The dust has settled from last night's showdown. {mvp} carried {winner_team} like they had a personal vendetta against losing. {xfactor_line}And {shaqtin}? Well, at least they made everyone else feel better about their game.",
    "{teams} went toe-to-toe last night and the basketball gods were watching. {mvp} earned that MVP playing like they had something to prove. {xfactor_line}{shaqtin} earned their award by... well, you had to be there.",
    "Another legendary night in the books! {mvp} was cooking with gas out there — absolutely could not be stopped. {xfactor_line}{shaqtin} on the other hand? More like Shaqtin' a WHOLE fool. {winner_team} takes the bragging rights!",
    "If last night was a movie, {mvp} would be the main character and {shaqtin} would be the comic sidekick. {xfactor_line}{teams} brought the energy and {winner_team} brought the wins. See you next week!",
]


def _generate_game_commentary(
    mvp: User | None,
    shaqtin: User | None,
    xfactor: User | None,
    team_scores: dict[str, str],
) -> str:
    """Generate fun commentary referencing teams and award winners."""
    team_names = list(team_scores.keys())
    teams_str = " vs ".join(team_names) if team_names else "the squads"

    # Find winning team (most wins)
    winner_team = "the squad"
    if team_scores:
        winner_team = max(team_scores, key=lambda t: int(team_scores[t]))

    xfactor_line = ""
    if xfactor:
        xfactor_line = f"{xfactor.full_name} was the X Factor — a true game-changer that shifted the momentum. "

    if mvp and shaqtin:
        template = random.choice(_COMMENTARY_TEMPLATES)
        return template.format(
            mvp=mvp.full_name,
            shaqtin=shaqtin.full_name,
            teams=teams_str,
            winner_team=winner_team,
            xfactor_line=xfactor_line,
        )
    else:
        # Build a simpler message when not all awards have winners
        parts = []
        if mvp:
            parts.append(f"{mvp.full_name} took home the MVP for {winner_team}.")
        if xfactor:
            parts.append(f"{xfactor.full_name} was the X Factor — a true game-changer.")
        if shaqtin:
            parts.append(f"{shaqtin.full_name} earned the Shaqtin' a Fool award. You know what you did.")
        if not parts:
            parts.append(f"Last night's game between {teams_str} is in the books!")
        else:
            parts.insert(0, f"What a night for {teams_str}!")
        return " ".join(parts)
