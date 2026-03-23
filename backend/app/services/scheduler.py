"""
Game Scheduler
==============
Automated tasks that run on a schedule to manage the game lifecycle.

TEACHING NOTE:
    This module defines the recurring jobs that drive the weekly flow:

    1. WEEKLY GAME CREATION (runs Sunday evening):
       Creates next week's game and sends invites to regular players.

    2. DROP-IN NOTIFICATION (runs 8 AM on game day):
       Any unclaimed spots are opened to drop-in players.

    3. TEAM CREATION (runs evening before game):
       Runs the balancing algorithm and publishes teams.

    4. AWARD ANNOUNCEMENTS (runs every hour):
       Checks for games whose 24-hour voting window has closed and
       announces MVP and Shaqtin' a Fool winners.

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
from app.services.notification_service import send_bulk_notification, send_notification
from app.models.algorithm_config import AlgorithmWeight, CustomMetric, PlayerCustomMetric
from app.models.team import TeamAssignment, TeamSide
from app.services.team_balancer import CustomMetricDef, create_balanced_teams
from app.models.vote import GameVote, VoteType

logger = logging.getLogger(__name__)

# Global scheduler instance
scheduler = AsyncIOScheduler()


def setup_scheduler():
    """Configure and start the background job scheduler.

    TEACHING NOTE:
        APScheduler supports three trigger types:
        - 'cron': run at specific times (like Unix cron)
        - 'interval': run every N minutes/hours/days
        - 'date': run once at a specific time

        We use 'cron' for weekly recurring jobs.
    """
    # Create next week's game every Sunday at 6 PM
    scheduler.add_job(
        create_weekly_game,
        "cron",
        day_of_week="sun",
        hour=18,
        minute=0,
        id="create_weekly_game",
        replace_existing=True,
    )

    # Open drop-in spots at 8 AM on game day
    game_day_map = {0: "mon", 1: "tue", 2: "wed", 3: "thu", 4: "fri", 5: "sat", 6: "sun"}
    game_day = game_day_map.get(settings.default_game_day, "wed")

    scheduler.add_job(
        open_dropin_spots,
        "cron",
        day_of_week=game_day,
        hour=8,
        minute=0,
        id="open_dropin_spots",
        replace_existing=True,
    )

    # Generate teams the evening before the game (6 PM night before)
    scheduler.add_job(
        generate_and_publish_teams,
        "cron",
        day_of_week=game_day,
        hour=18,
        minute=0,
        id="generate_teams",
        replace_existing=True,
    )

    # Check for closed voting windows and announce awards (every hour)
    scheduler.add_job(
        announce_awards,
        "interval",
        hours=1,
        id="announce_awards",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("Scheduler started with weekly game jobs")


# =============================================================================
# Scheduled Jobs
# =============================================================================

async def create_weekly_game():
    """Create next week's game and invite all regular players.

    TEACHING NOTE:
        This runs every Sunday evening. It:
        1. Calculates next week's game date
        2. Creates the Game record
        3. Finds all REGULAR players
        4. Creates PENDING RSVPs for each
        5. Sends invitation notifications (email + SMS + in-app)
    """
    logger.info("Creating weekly game...")

    async with async_session() as db:
        try:
            # Calculate next game date
            now = datetime.now(timezone.utc)
            days_until_game = (settings.default_game_day - now.weekday()) % 7
            if days_until_game == 0:
                days_until_game = 7  # Next week, not today
            game_date = now + timedelta(days=days_until_game)

            # Parse game time
            hour, minute = map(int, settings.default_game_time.split(":"))
            game_date = game_date.replace(hour=hour, minute=minute, second=0, microsecond=0)

            # Create the game
            game = Game(
                title=f"Weekly Pickup - {game_date.strftime('%b %d')}",
                game_date=game_date,
                location="TBD",
                status=GameStatus.INVITES_SENT,
                roster_size=settings.game_roster_size,
            )
            db.add(game)
            await db.flush()

            # Get all regular players
            result = await db.execute(
                select(User).where(
                    User.player_status == PlayerStatus.REGULAR,
                    User.is_active == True,  # noqa: E712
                )
            )
            regular_players = result.scalars().all()

            # Create RSVPs and send invitations
            for player in regular_players:
                rsvp = RSVP(
                    game_id=game.id,
                    user_id=player.id,
                    status=RSVPStatus.PENDING,
                )
                db.add(rsvp)

            deadline = game_date - timedelta(hours=24)
            await send_bulk_notification(
                db,
                regular_players,
                NotificationType.GAME_INVITE,
                f"Game Invite: {game.title}",
                f"You're invited to play on {game_date.strftime('%A, %B %d at %I:%M %p')}. "
                f"Please RSVP by {deadline.strftime('%A at %I:%M %p')}.",
            )

            await db.commit()
            logger.info(f"Created game {game.id} and invited {len(regular_players)} players")

        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to create weekly game: {e}")


async def open_dropin_spots():
    """Open unclaimed spots to drop-in players at 8 AM on game day.

    TEACHING NOTE:
        This runs at 8 AM on game day. It:
        1. Finds today's game
        2. Counts unclaimed spots (roster_size - accepted RSVPs)
        3. If spots are available, changes game status to DROPIN_OPEN
        4. Notifies all DROP-IN players about the available spots
    """
    logger.info("Checking for drop-in spots...")

    async with async_session() as db:
        try:
            now = datetime.now(timezone.utc)
            today_start = now.replace(hour=0, minute=0, second=0)
            today_end = now.replace(hour=23, minute=59, second=59)

            # Find today's game
            result = await db.execute(
                select(Game).where(
                    Game.game_date.between(today_start, today_end),
                    Game.status == GameStatus.INVITES_SENT,
                )
            )
            game = result.scalar_one_or_none()

            if not game:
                logger.info("No game found for today")
                return

            spots = game.spots_remaining
            if spots <= 0:
                logger.info(f"Game {game.id} is full, no drop-in spots available")
                return

            # Update game status
            game.status = GameStatus.DROPIN_OPEN

            # Get all drop-in players
            result = await db.execute(
                select(User).where(
                    User.player_status == PlayerStatus.DROPIN,
                    User.is_active == True,  # noqa: E712
                )
            )
            dropin_players = result.scalars().all()

            if dropin_players:
                await send_bulk_notification(
                    db,
                    dropin_players,
                    NotificationType.DROPIN_AVAILABLE,
                    f"{spots} Spots Available Today!",
                    f"There are {spots} open spots for today's game at "
                    f"{game.game_date.strftime('%I:%M %p')}. "
                    f"First come, first served - RSVP now!",
                )

            await db.commit()
            logger.info(f"Opened {spots} drop-in spots for game {game.id}")

        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to open drop-in spots: {e}")


async def generate_and_publish_teams():
    """Generate balanced teams and notify all accepted players.

    TEACHING NOTE:
        This runs the evening of game day. It:
        1. Finds today's game
        2. Collects all accepted players
        3. Runs the team balancing algorithm
        4. Saves team assignments to the database
        5. Notifies everyone of their team assignment
    """
    logger.info("Generating teams...")

    async with async_session() as db:
        try:
            now = datetime.now(timezone.utc)
            today_start = now.replace(hour=0, minute=0, second=0)
            today_end = now.replace(hour=23, minute=59, second=59)

            # Find today's game
            result = await db.execute(
                select(Game).where(
                    Game.game_date.between(today_start, today_end),
                    Game.status.in_([GameStatus.INVITES_SENT, GameStatus.DROPIN_OPEN]),
                )
            )
            game = result.scalar_one_or_none()

            if not game:
                logger.info("No eligible game found for team generation")
                return

            # Get accepted players
            rsvp_result = await db.execute(
                select(RSVP).where(
                    RSVP.game_id == game.id,
                    RSVP.status == RSVPStatus.ACCEPTED,
                )
            )
            accepted_rsvps = rsvp_result.scalars().all()
            player_ids = [r.user_id for r in accepted_rsvps]

            if len(player_ids) < 2:
                logger.info(f"Not enough players for game {game.id}")
                return

            # Fetch full player data
            players_result = await db.execute(select(User).where(User.id.in_(player_ids)))
            players = list(players_result.scalars().all())

            # Load algorithm config from DB
            weights_result = await db.execute(select(AlgorithmWeight))
            db_weights = weights_result.scalars().all()
            weights = {w.metric_name: w.weight for w in db_weights} if db_weights else None

            cm_result = await db.execute(select(CustomMetric))
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

            # Generate teams
            team_a_players, team_b_players = create_balanced_teams(
                players,
                weights=weights,
                custom_metrics=custom_metric_defs,
                player_custom_values=player_custom_values,
            )

            # Save assignments
            for i, player in enumerate(team_a_players):
                db.add(TeamAssignment(
                    game_id=game.id,
                    user_id=player.id,
                    team=TeamSide.TEAM_A,
                    is_starter=i < 5,
                ))

            for i, player in enumerate(team_b_players):
                db.add(TeamAssignment(
                    game_id=game.id,
                    user_id=player.id,
                    team=TeamSide.TEAM_B,
                    is_starter=i < 5,
                ))

            game.status = GameStatus.TEAMS_SET

            # Notify all players
            all_players = team_a_players + team_b_players
            for player in all_players:
                team_name = "Team A" if player in team_a_players else "Team B"
                await send_notification(
                    db,
                    player,
                    NotificationType.TEAMS_PUBLISHED,
                    "Teams Are Set!",
                    f"You're on {team_name} for tonight's game. See you on the court!",
                )

            await db.commit()
            logger.info(
                f"Teams generated for game {game.id}: "
                f"Team A ({len(team_a_players)}) vs Team B ({len(team_b_players)})"
            )

        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to generate teams: {e}")


async def announce_awards():
    """Check for games with closed voting windows and announce winners.

    TEACHING NOTE:
        This runs every hour. It looks for COMPLETED games where:
        - The voting window has closed (24h after game time)
        - Awards haven't been announced yet (no AWARDS_ANNOUNCED notification exists)

        When found, it tallies the votes, determines the MVP and Shaqtin'
        winners, and notifies all participants.
    """
    logger.info("Checking for award announcements...")

    async with async_session() as db:
        try:
            from app.models.notification import Notification

            now = datetime.now(timezone.utc)

            # Find completed games where voting window has closed
            result = await db.execute(
                select(Game).where(Game.status == GameStatus.COMPLETED)
            )
            completed_games = result.scalars().all()

            for game in completed_games:
                game_time = game.game_date
                if game_time.tzinfo is None:
                    game_time = game_time.replace(tzinfo=timezone.utc)
                voting_deadline = game_time + timedelta(hours=24)

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

                # Tally MVP votes
                mvp_winner = await _tally_votes(db, game.id, VoteType.MVP)
                shaqtin_winner = await _tally_votes(db, game.id, VoteType.SHAQTIN)

                if not mvp_winner and not shaqtin_winner:
                    logger.info(f"No votes cast for game {game.id}, skipping announcement")
                    continue

                # Build announcement message
                parts = []
                if mvp_winner:
                    parts.append(f"MVP: {mvp_winner.full_name} 🏆")
                if shaqtin_winner:
                    parts.append(f"Shaqtin' a Fool: {shaqtin_winner.full_name} 🤦")
                message = " | ".join(parts)

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
                    f"Awards Announced - Game #{game.id}",
                    f"The votes are in for {game.title}! {message}",
                )

                logger.info(f"Awards announced for game {game.id}: {message}")

            await db.commit()

        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to announce awards: {e}")


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
