"""
Seed Test Runs, Players, and Games
====================================
Creates test data for multiple runs to exercise multi-run functionality.
Does NOT modify Monday Madness (run_id=1) or its existing players.

Run from the backend directory:
    venv/Scripts/python.exe seed_test_runs.py
"""

import asyncio
import random
from datetime import datetime, timedelta, timezone

from app.database import async_session, engine, Base
from app.models.user import User, UserRole, PlayerStatus
from app.models.game import Game, GameStatus, RSVP, RSVPStatus
from app.models.team import TeamAssignment, GameResult, TeamScore, pick_team_names
from app.models.vote import GameVote, VoteType
from app.models.run import Run, RunMembership, RunAdmin, RunPlayerStats, PlayerSuggestion
from app.models.notification import Notification, NotificationType
from app.models.rating import PlayerRating
from app.models.algorithm_config import AlgorithmWeight, CustomMetric, PlayerCustomMetric
from app.auth.password import hash_password

from sqlalchemy import text, select

DEFAULT_PASSWORD = hash_password("Password123")

AVATAR_IDS = [
    "jordan", "magic", "bird", "isiah", "drexler", "wilkins", "ewing",
    "barkley", "malone", "stockton", "hakeem", "robinson", "pippen",
    "shaq", "iverson", "kobe", "duncan", "kg", "penny", "payton",
    "kidd", "carter", "tmac", "nash", "dirk", "reggie", "ray",
    "pierce", "yao", "benwallace", "lebron", "wade", "cp3", "melo",
    "dwight", "pau", "tony", "manu", "rondo", "billups", "westbrook",
    "durant", "drose", "bosh", "davis", "frazier", "ljohnson",
]


async def seed():
    async with async_session() as db:
        print("=== Seeding Test Runs, Players, and Games ===\n")

        # =====================================================================
        # 1. Create new test players (not in Monday Madness)
        # =====================================================================
        test_players_data = [
            ("Marcus", 18, 12),
            ("Tyler", 15, 15),
            ("Devon", 20, 10),
            ("Jamal", 12, 18),
            ("Andre", 16, 14),
            ("Trey", 22, 8),
            ("Kareem", 10, 20),
            ("Darius", 19, 11),
            ("Malik", 14, 16),
            ("Isaiah", 17, 13),
            ("Zion", 21, 9),
            ("Jaylen", 11, 19),
            ("LaMarcus", 16, 14),
            ("DeMar", 13, 17),
            ("Kyle", 18, 12),
        ]

        used_avatars = []
        new_players = []

        for name, wins, losses in test_players_data:
            username = name.lower()
            email = f"{username}@youballin.app"

            # Check if exists
            existing = await db.execute(select(User).where(User.email == email))
            if existing.scalar_one_or_none():
                # Fetch the existing user
                result = await db.execute(select(User).where(User.email == email))
                new_players.append(result.scalar_one())
                continue

            available = [a for a in AVATAR_IDS if a not in used_avatars]
            if not available:
                available = AVATAR_IDS
            avatar = random.choice(available)
            used_avatars.append(avatar)

            gp = wins + losses
            jf = wins / gp if gp > 0 else 0.5

            user = User(
                email=email,
                username=username,
                hashed_password=DEFAULT_PASSWORD,
                full_name=name,
                avatar_url=avatar,
                role=UserRole.PLAYER,
                player_status=PlayerStatus.REGULAR,
                is_active=True,
                games_played=gp,
                games_won=wins,
                jordan_factor=jf,
            )
            db.add(user)
            new_players.append(user)

        await db.flush()
        print(f"[OK] Created/found {len(new_players)} test players")

        # =====================================================================
        # 2. Create Test Run: "Wednesday Warriors"
        # =====================================================================
        result = await db.execute(select(Run).where(Run.name == "Wednesday Warriors"))
        wed_run = result.scalar_one_or_none()
        if not wed_run:
            wed_run = Run(
                name="Wednesday Warriors",
                description="Competitive midweek basketball for serious ballers",
                default_location="Downtown YMCA",
                default_game_day=2,  # Wednesday
                default_game_time="19:30",
                default_roster_size=12,
                default_num_teams=2,
                dues_amount=15.00,
                skill_level=4,  # Competitive
                needs_players=True,
                is_active=True,
            )
            db.add(wed_run)
            await db.flush()
            print(f"[OK] Created 'Wednesday Warriors' run (id={wed_run.id})")
        else:
            print(f"  Wednesday Warriors already exists (id={wed_run.id})")

        # =====================================================================
        # 3. Create Test Run: "Sunday Funday"
        # =====================================================================
        result = await db.execute(select(Run).where(Run.name == "Sunday Funday"))
        sun_run = result.scalar_one_or_none()
        if not sun_run:
            sun_run = Run(
                name="Sunday Funday",
                description="Casual weekend pickup games - all skill levels welcome!",
                default_location="Riverside Park Outdoor Courts",
                default_game_day=6,  # Sunday
                default_game_time="14:00",
                default_roster_size=16,
                default_num_teams=2,
                dues_amount=None,
                skill_level=2,  # Casual
                needs_players=False,
                is_active=True,
            )
            db.add(sun_run)
            await db.flush()
            print(f"[OK] Created 'Sunday Funday' run (id={sun_run.id})")
        else:
            print(f"  Sunday Funday already exists (id={sun_run.id})")

        # =====================================================================
        # 4. Assign players to runs with memberships
        # =====================================================================

        # Wednesday Warriors: first 10 new players + Carey and Bryan from Monday Madness
        wed_players = new_players[:10]
        # Also add some Monday Madness crossover players
        carey_result = await db.execute(select(User).where(User.id == 16))
        carey = carey_result.scalar_one_or_none()
        bryan_result = await db.execute(select(User).where(User.id == 11))
        bryan = bryan_result.scalar_one_or_none()
        if carey:
            wed_players.append(carey)
        if bryan:
            wed_players.append(bryan)

        wed_memberships_created = 0
        for player in wed_players:
            existing = await db.execute(
                select(RunMembership).where(
                    RunMembership.run_id == wed_run.id,
                    RunMembership.user_id == player.id,
                )
            )
            if existing.scalar_one_or_none():
                continue
            status = PlayerStatus.REGULAR if player in new_players[:8] else PlayerStatus.DROPIN
            db.add(RunMembership(
                run_id=wed_run.id,
                user_id=player.id,
                player_status=status,
                dues_paid=random.choice([True, True, False]),
            ))
            db.add(RunPlayerStats(
                run_id=wed_run.id,
                user_id=player.id,
                games_played=player.games_played,
                games_won=player.games_won,
                jordan_factor=player.jordan_factor,
            ))
            wed_memberships_created += 1
        print(f"[OK] Created {wed_memberships_created} memberships for Wednesday Warriors")

        # Sunday Funday: last 10 new players + some Monday Madness crossover
        sun_players = new_players[5:]  # overlap with some Wed players
        # Add Alic as a member too
        alic_result = await db.execute(select(User).where(User.id == 23))
        alic = alic_result.scalar_one_or_none()
        if alic:
            sun_players.append(alic)
        if carey:
            sun_players.append(carey)

        sun_memberships_created = 0
        for player in sun_players:
            existing = await db.execute(
                select(RunMembership).where(
                    RunMembership.run_id == sun_run.id,
                    RunMembership.user_id == player.id,
                )
            )
            if existing.scalar_one_or_none():
                continue
            db.add(RunMembership(
                run_id=sun_run.id,
                user_id=player.id,
                player_status=PlayerStatus.REGULAR,
                dues_paid=True,
            ))
            db.add(RunPlayerStats(
                run_id=sun_run.id,
                user_id=player.id,
                games_played=player.games_played,
                games_won=player.games_won,
                jordan_factor=player.jordan_factor,
            ))
            sun_memberships_created += 1
        print(f"[OK] Created {sun_memberships_created} memberships for Sunday Funday")

        # =====================================================================
        # 5. Make Carey a Run Admin of Wednesday Warriors
        # =====================================================================
        existing = await db.execute(
            select(RunAdmin).where(RunAdmin.run_id == wed_run.id, RunAdmin.user_id == 16)
        )
        if not existing.scalar_one_or_none():
            db.add(RunAdmin(run_id=wed_run.id, user_id=16))
            print("[OK] Made Carey a Run Admin of Wednesday Warriors")

        # Make Alic a Run Admin of Sunday Funday (he's already super admin)
        existing = await db.execute(
            select(RunAdmin).where(RunAdmin.run_id == sun_run.id, RunAdmin.user_id == 23)
        )
        if not existing.scalar_one_or_none():
            db.add(RunAdmin(run_id=sun_run.id, user_id=23))
            print("[OK] Made Alic a Run Admin of Sunday Funday")

        await db.flush()

        # =====================================================================
        # 6. Create completed games for Wednesday Warriors
        # =====================================================================
        wed_game_dates = [
            datetime(2026, 2, 18, 19, 30, tzinfo=timezone.utc),
            datetime(2026, 2, 25, 19, 30, tzinfo=timezone.utc),
            datetime(2026, 3, 4, 19, 30, tzinfo=timezone.utc),
        ]

        for i, game_date in enumerate(wed_game_dates):
            title = f"Wed Warriors - {game_date.strftime('%b %d')}"

            # Check if game already exists
            existing = await db.execute(
                select(Game).where(Game.title == title, Game.run_id == wed_run.id)
            )
            if existing.scalar_one_or_none():
                print(f"  Game '{title}' already exists, skipping")
                continue

            game = Game(
                run_id=wed_run.id,
                title=title,
                game_date=game_date,
                location="Downtown YMCA",
                status=GameStatus.COMPLETED,
                roster_size=12,
                num_teams=2,
            )
            db.add(game)
            await db.flush()

            # Pick 10 random players for this game
            game_players = random.sample(wed_players, min(10, len(wed_players)))

            # Create RSVPs
            for player in game_players:
                db.add(RSVP(
                    game_id=game.id,
                    user_id=player.id,
                    status=RSVPStatus.ACCEPTED,
                    responded_at=game_date - timedelta(days=2),
                ))

            # Create teams
            team_names = pick_team_names(2)
            random.shuffle(game_players)
            mid = len(game_players) // 2
            team_a = game_players[:mid]
            team_b = game_players[mid:]

            for player in team_a:
                db.add(TeamAssignment(
                    game_id=game.id, user_id=player.id,
                    team="team_1", team_name=team_names[0],
                ))
            for player in team_b:
                db.add(TeamAssignment(
                    game_id=game.id, user_id=player.id,
                    team="team_2", team_name=team_names[1],
                ))

            # Create result
            team_a_wins = random.randint(1, 4)
            team_b_wins = random.randint(1, 4)
            game_result = GameResult(game_id=game.id)
            db.add(game_result)
            await db.flush()

            db.add(TeamScore(
                game_result_id=game_result.id,
                team="team_1", team_name=team_names[0], wins=team_a_wins,
            ))
            db.add(TeamScore(
                game_result_id=game_result.id,
                team="team_2", team_name=team_names[1], wins=team_b_wins,
            ))

            # Create votes
            for voter in game_players:
                eligible = [p for p in game_players if p.id != voter.id]
                if eligible:
                    mvp_pick = random.choice(eligible)
                    db.add(GameVote(
                        game_id=game.id, voter_id=voter.id,
                        nominee_id=mvp_pick.id, vote_type=VoteType.MVP,
                    ))
                    shaqtin_pick = random.choice(eligible)
                    db.add(GameVote(
                        game_id=game.id, voter_id=voter.id,
                        nominee_id=shaqtin_pick.id, vote_type=VoteType.SHAQTIN,
                    ))

            print(f"[OK] Created Wed Warriors game: {title} ({team_names[0]} {team_a_wins} - {team_names[1]} {team_b_wins})")

        # =====================================================================
        # 7. Create games for Sunday Funday (2 completed + 1 upcoming)
        # =====================================================================
        sun_game_dates = [
            datetime(2026, 3, 1, 14, 0, tzinfo=timezone.utc),
            datetime(2026, 3, 8, 14, 0, tzinfo=timezone.utc),
        ]

        for game_date in sun_game_dates:
            title = f"Sunday Funday - {game_date.strftime('%b %d')}"

            existing = await db.execute(
                select(Game).where(Game.title == title, Game.run_id == sun_run.id)
            )
            if existing.scalar_one_or_none():
                print(f"  Game '{title}' already exists, skipping")
                continue

            game = Game(
                run_id=sun_run.id,
                title=title,
                game_date=game_date,
                location="Riverside Park Outdoor Courts",
                status=GameStatus.COMPLETED,
                roster_size=16,
                num_teams=2,
            )
            db.add(game)
            await db.flush()

            game_players = random.sample(sun_players, min(12, len(sun_players)))

            for player in game_players:
                db.add(RSVP(
                    game_id=game.id, user_id=player.id,
                    status=RSVPStatus.ACCEPTED,
                    responded_at=game_date - timedelta(days=1),
                ))

            team_names = pick_team_names(2)
            random.shuffle(game_players)
            mid = len(game_players) // 2
            team_a = game_players[:mid]
            team_b = game_players[mid:]

            for player in team_a:
                db.add(TeamAssignment(
                    game_id=game.id, user_id=player.id,
                    team="team_1", team_name=team_names[0],
                ))
            for player in team_b:
                db.add(TeamAssignment(
                    game_id=game.id, user_id=player.id,
                    team="team_2", team_name=team_names[1],
                ))

            team_a_wins = random.randint(2, 5)
            team_b_wins = random.randint(2, 5)
            game_result = GameResult(game_id=game.id)
            db.add(game_result)
            await db.flush()

            db.add(TeamScore(
                game_result_id=game_result.id,
                team="team_1", team_name=team_names[0], wins=team_a_wins,
            ))
            db.add(TeamScore(
                game_result_id=game_result.id,
                team="team_2", team_name=team_names[1], wins=team_b_wins,
            ))

            for voter in game_players:
                eligible = [p for p in game_players if p.id != voter.id]
                if eligible:
                    db.add(GameVote(
                        game_id=game.id, voter_id=voter.id,
                        nominee_id=random.choice(eligible).id, vote_type=VoteType.MVP,
                    ))

            print(f"[OK] Created Sunday Funday game: {title} ({team_names[0]} {team_a_wins} - {team_names[1]} {team_b_wins})")

        # Create an upcoming Sunday game
        upcoming_title = "Sunday Funday - Mar 29"
        existing = await db.execute(
            select(Game).where(Game.title == upcoming_title, Game.run_id == sun_run.id)
        )
        if not existing.scalar_one_or_none():
            upcoming = Game(
                run_id=sun_run.id,
                title=upcoming_title,
                game_date=datetime(2026, 3, 29, 14, 0, tzinfo=timezone.utc),
                location="Riverside Park Outdoor Courts",
                status=GameStatus.INVITES_SENT,
                roster_size=16,
                num_teams=2,
            )
            db.add(upcoming)
            await db.flush()

            # Add some RSVPs
            for player in random.sample(sun_players, min(8, len(sun_players))):
                db.add(RSVP(
                    game_id=upcoming.id, user_id=player.id,
                    status=random.choice([RSVPStatus.ACCEPTED, RSVPStatus.ACCEPTED, RSVPStatus.PENDING]),
                ))
            print(f"[OK] Created upcoming Sunday Funday game: {upcoming_title}")

        # Create an upcoming Wednesday game
        upcoming_wed_title = "Wed Warriors - Mar 25"
        existing = await db.execute(
            select(Game).where(Game.title == upcoming_wed_title, Game.run_id == wed_run.id)
        )
        if not existing.scalar_one_or_none():
            upcoming_wed = Game(
                run_id=wed_run.id,
                title=upcoming_wed_title,
                game_date=datetime(2026, 3, 25, 19, 30, tzinfo=timezone.utc),
                location="Downtown YMCA",
                status=GameStatus.SCHEDULED,
                roster_size=12,
                num_teams=2,
            )
            db.add(upcoming_wed)
            await db.flush()
            print(f"[OK] Created upcoming Wednesday Warriors game: {upcoming_wed_title}")

        # =====================================================================
        # 8. Create a player suggestion (from Carey to Sunday Funday)
        # =====================================================================
        # Carey (Wed Warriors admin) suggests Marcus for Sunday Funday
        marcus = next((p for p in new_players if p.full_name == "Marcus"), None)
        if marcus:
            existing = await db.execute(
                select(PlayerSuggestion).where(
                    PlayerSuggestion.run_id == sun_run.id,
                    PlayerSuggestion.suggested_user_id == marcus.id,
                )
            )
            if not existing.scalar_one_or_none():
                # Check Marcus isn't already in Sunday Funday
                mem_check = await db.execute(
                    select(RunMembership).where(
                        RunMembership.run_id == sun_run.id,
                        RunMembership.user_id == marcus.id,
                    )
                )
                if not mem_check.scalar_one_or_none():
                    db.add(PlayerSuggestion(
                        run_id=sun_run.id,
                        suggested_user_id=marcus.id,
                        suggested_by_user_id=16,  # Carey
                        message="Great competitive player, would fit well in the casual Sunday games too",
                    ))
                    print("[OK] Created player suggestion: Carey suggests Marcus for Sunday Funday")

        await db.commit()

        # =====================================================================
        # 9. Print summary
        # =====================================================================
        print("\n=== Summary ===")
        result = await db.execute(text("SELECT id, name, skill_level, needs_players FROM runs WHERE is_active = 1"))
        for row in result.fetchall():
            print(f"  Run: {row[1]} (id={row[0]}, skill={row[2]}, needs_players={row[3]})")

            members = await db.execute(text(f"SELECT COUNT(*) FROM run_memberships WHERE run_id = {row[0]}"))
            games = await db.execute(text(f"SELECT COUNT(*) FROM games WHERE run_id = {row[0]}"))
            admins = await db.execute(text(f"SELECT COUNT(*) FROM run_admins WHERE run_id = {row[0]}"))
            print(f"    Members: {members.scalar()}, Games: {games.scalar()}, Admins: {admins.scalar()}")

        result = await db.execute(text("SELECT COUNT(*) FROM users WHERE is_active = 1"))
        print(f"\n  Total active users: {result.scalar()}")

        suggestions = await db.execute(text("SELECT COUNT(*) FROM player_suggestions WHERE status = 'PENDING'"))
        print(f"  Pending suggestions: {suggestions.scalar()}")

        print("\n[DONE] Test data seeded successfully!")


if __name__ == "__main__":
    asyncio.run(seed())
