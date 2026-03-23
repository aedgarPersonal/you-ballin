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

    4. VOTING REMINDERS (runs 9 AM daily):
       Reminds players who haven't voted to cast their MVP and Shaqtin'
       votes before the noon deadline.

    5. AWARD ANNOUNCEMENTS (runs every 30 minutes):
       Checks for games whose voting window has closed (noon day after)
       and announces winners with top 10 standings and fun commentary.

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
    """Auto-generate balanced teams 1 hour before game time.

    TEACHING NOTE:
        This runs every 15 minutes and checks for upcoming games where:
        - The game starts within the next hour
        - Teams haven't been set yet (status is INVITES_SENT or DROPIN_OPEN)

        This means an admin can manually generate teams at any time before
        the 1-hour window. If they don't, this job handles it automatically.
    """
    logger.info("Checking for games needing auto team generation...")

    async with async_session() as db:
        try:
            now = datetime.now(timezone.utc)
            one_hour_from_now = now + timedelta(hours=1)

            # Find games starting within the next hour that still need teams
            result = await db.execute(
                select(Game).where(
                    Game.game_date <= one_hour_from_now,
                    Game.game_date > now,
                    Game.status.in_([GameStatus.INVITES_SENT, GameStatus.DROPIN_OPEN]),
                )
            )
            games = result.scalars().all()

            if not games:
                logger.info("No games need auto team generation")
                return

            for game in games:
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

            now = datetime.now(timezone.utc)

            result = await db.execute(
                select(Game).where(Game.status == GameStatus.COMPLETED)
            )
            completed_games = result.scalars().all()

            for game in completed_games:
                game_time = game.game_date
                if game_time.tzinfo is None:
                    game_time = game_time.replace(tzinfo=timezone.utc)

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

                await send_bulk_notification(
                    db,
                    players,
                    NotificationType.RSVP_REMINDER,
                    f"Vote Reminder - Game #{game.id}",
                    f"Don't forget to cast your MVP and Shaqtin' a Fool votes for {game.title}! "
                    f"Voting closes at noon today. Your voice matters!",
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
                voting_deadline = (game_time + timedelta(days=1)).replace(
                    hour=12, minute=0, second=0, microsecond=0
                )

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

                # Increment award counts on winner profiles
                if mvp_winner:
                    mvp_winner.mvp_count += 1
                if shaqtin_winner:
                    shaqtin_winner.shaqtin_count += 1
                if xfactor_winner:
                    xfactor_winner.xfactor_count += 1

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

                # Get top 10 overall standings
                top10 = await _get_top10_standings(db)
                standings_lines = []
                for rank, player in enumerate(top10, 1):
                    medal = {1: "🥇", 2: "🥈", 3: "🥉"}.get(rank, f"{rank}.")
                    jf_pct = int((player.jordan_factor or 0.5) * 100)
                    standings_lines.append(
                        f"{medal} {player.full_name} - {jf_pct}% JF ({player.games_won}W-{player.games_played - player.games_won}L)"
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
                    f"Awards Announced - Game #{game.id}",
                    message,
                )

                logger.info(f"Awards announced for game {game.id}: {awards_line}")

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
    """Get top 10 players by Jordan Factor (must have played at least 1 game)."""
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
