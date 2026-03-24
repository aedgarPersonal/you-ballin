"""
Seed Monday Run with players from basketball_win_loss_records.docx
=================================================================
Removes all existing memberships from the Monday run and replaces
them with the 20 players from the document. Makes Carey a run admin.

Usage:
    cd backend
    python seed_monday_run.py
"""

import asyncio
import random

from sqlalchemy import select, delete

from app.auth.password import hash_password
from app.database import async_session, engine, Base
# Import all models so SQLAlchemy can resolve relationships
from app.models.user import PlayerStatus, User, UserRole
from app.models.game import Game, RSVP
from app.models.team import TeamAssignment, GameResult, TeamScore
from app.models.run import Run, RunAdmin, RunMembership, RunPlayerStats
from app.models.vote import GameVote
from app.models.rating import PlayerRating
from app.models.notification import Notification
from app.models.algorithm_config import AlgorithmWeight, CustomMetric, PlayerCustomMetric
from app.routes.admin_routes import AVATAR_IDS

# Players extracted from basketball_win_loss_records.docx
PLAYERS = [
    {"name": "Bryan", "wins": 26, "losses": 14},
    {"name": "Julien", "wins": 23, "losses": 12},
    {"name": "Denis", "wins": 23, "losses": 17},
    {"name": "Imran", "wins": 22, "losses": 15},
    {"name": "Gary", "wins": 21, "losses": 19},
    {"name": "Carey", "wins": 20, "losses": 18},
    {"name": "Ren", "wins": 20, "losses": 20},
    {"name": "Didier", "wins": 19, "losses": 21},
    {"name": "Chris", "wins": 18, "losses": 22},
    {"name": "Seb", "wins": 18, "losses": 22},
    {"name": "Mike", "wins": 17, "losses": 23},
    {"name": "Shamir", "wins": 16, "losses": 18},
    {"name": "Alic", "wins": 15, "losses": 21},
    {"name": "Bobby", "wins": 14, "losses": 16},
    {"name": "Dan", "wins": 14, "losses": 9},
    {"name": "Dion", "wins": 13, "losses": 8},
    {"name": "Hendrick", "wins": 11, "losses": 11},
    {"name": "Sean", "wins": 11, "losses": 14},
    {"name": "Ryan", "wins": 9, "losses": 7},
    {"name": "Jeff", "wins": 3, "losses": 7},
]

DEFAULT_PASSWORD = "Password123"
RUN_NAME = "Monday Run"


async def seed():
    # Create tables if needed
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as session:
        # --- Find or create the Monday run ---
        result = await session.execute(select(Run).where(Run.name == RUN_NAME))
        run = result.scalar_one_or_none()

        if run:
            print(f"Found existing run: {RUN_NAME} (id={run.id})")

            # Remove existing memberships, stats, and admins
            await session.execute(
                delete(RunPlayerStats).where(RunPlayerStats.run_id == run.id)
            )
            await session.execute(
                delete(RunMembership).where(RunMembership.run_id == run.id)
            )
            await session.execute(
                delete(RunAdmin).where(RunAdmin.run_id == run.id)
            )
            print("Cleared existing memberships, stats, and admins.")
        else:
            run = Run(
                name=RUN_NAME,
                description="Monday night pickup basketball",
                default_location="TBD",
                default_game_day=0,  # Monday
                default_game_time="19:00",
                default_roster_size=16,
                default_num_teams=2,
                is_active=True,
            )
            session.add(run)
            await session.flush()
            print(f"Created new run: {RUN_NAME} (id={run.id})")

        # --- Create or find players ---
        hashed_pw = hash_password(DEFAULT_PASSWORD)
        used_avatars = []
        carey_user = None

        for entry in PLAYERS:
            name = entry["name"]
            username = name.lower().replace(" ", "").replace("'", "")
            email = f"{username}@youballin.app"

            # Check if user already exists
            existing = await session.execute(
                select(User).where(
                    (User.username == username) | (User.email == email)
                )
            )
            user = existing.scalar_one_or_none()

            games_played = entry["wins"] + entry["losses"]
            jordan_factor = entry["wins"] / games_played if games_played > 0 else 0.5

            if user:
                # Update existing user's stats
                user.games_played = games_played
                user.games_won = entry["wins"]
                user.jordan_factor = jordan_factor
                print(f"  Updated existing user: {name} (@{username})")
            else:
                # Pick a random avatar
                available = [a for a in AVATAR_IDS if a not in used_avatars]
                if not available:
                    available = AVATAR_IDS
                avatar = random.choice(available)
                used_avatars.append(avatar)

                user = User(
                    email=email,
                    username=username,
                    hashed_password=hashed_pw,
                    full_name=name,
                    avatar_url=avatar,
                    role=UserRole.PLAYER,
                    player_status=PlayerStatus.REGULAR,
                    is_active=True,
                    games_played=games_played,
                    games_won=entry["wins"],
                    jordan_factor=jordan_factor,
                )
                session.add(user)
                await session.flush()
                print(f"  Created user: {name} (@{username}, avatar={avatar})")

            # Create run membership
            session.add(RunMembership(
                run_id=run.id,
                user_id=user.id,
                player_status=PlayerStatus.REGULAR,
            ))

            # Create run player stats
            session.add(RunPlayerStats(
                run_id=run.id,
                user_id=user.id,
                games_played=games_played,
                games_won=entry["wins"],
                jordan_factor=jordan_factor,
            ))

            if name.lower() == "carey":
                carey_user = user

        # --- Make Carey a run admin ---
        if carey_user:
            session.add(RunAdmin(
                run_id=run.id,
                user_id=carey_user.id,
            ))
            print(f"\nSet Carey (id={carey_user.id}) as run admin for {RUN_NAME}")

        await session.commit()
        print(f"\nDone! {len(PLAYERS)} players added to {RUN_NAME}.")
        print(f"Default password for all imported players: {DEFAULT_PASSWORD}")


if __name__ == "__main__":
    asyncio.run(seed())
