"""
Migration Script: Introduce Run Concept
========================================
This script migrates the existing SQLite database to support the Run architecture.

Steps:
1. Back up the existing database
2. Add new tables (runs, run_memberships, run_admins, run_player_stats)
3. Add run_id columns to existing tables (games, notifications, player_ratings, algorithm_weights, custom_metrics)
4. Create a "Default Run" and migrate all existing data into it
5. Set up admin roles (Alic = super_admin, Carey = run admin)

Run from the backend directory:
    venv/Scripts/python.exe migrate_to_runs.py
"""

import asyncio
import shutil
from datetime import datetime
from pathlib import Path

# Ensure all models are imported so SQLAlchemy knows about them
from app.database import engine, async_session, Base
from app.models.user import User, UserRole, PlayerStatus
from app.models.game import Game, GameStatus, RSVP, RSVPStatus
from app.models.team import GameResult, TeamAssignment, TeamScore
from app.models.vote import GameVote, VoteType
from app.models.notification import Notification, NotificationType
from app.models.rating import PlayerRating
from app.models.algorithm_config import AlgorithmWeight, CustomMetric, PlayerCustomMetric
from app.models.run import Run, RunMembership, RunAdmin, RunPlayerStats

from sqlalchemy import text, inspect


async def migrate():
    db_path = Path("./you_ballin.db")

    # Step 0: Back up the database
    backup_path = db_path.with_suffix(f".db.backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
    if db_path.exists():
        shutil.copy2(db_path, backup_path)
        print(f"[OK] Database backed up to {backup_path}")
    else:
        print("[WARN] No existing database found, will create fresh")

    # Step 1: Check current state and create new tables
    async with engine.begin() as conn:
        # Get existing tables
        existing_tables = await conn.run_sync(
            lambda sync_conn: inspect(sync_conn).get_table_names()
        )
        print(f"  Existing tables: {existing_tables}")

        # Check if migration already ran
        if "runs" in existing_tables:
            print("[WARN] 'runs' table already exists. Migration may have already run.")
            print("  Continuing to ensure data migration is complete...")

    # Step 2: Add new columns to existing tables using raw SQL (SQLite ALTER TABLE)
    async with engine.begin() as conn:
        # Add run_id to games (nullable first, then backfill, then we leave it nullable
        # because SQLite can't ALTER to NOT NULL after the fact)
        try:
            await conn.execute(text("ALTER TABLE games ADD COLUMN run_id INTEGER REFERENCES runs(id)"))
            print("[OK] Added run_id column to games")
        except Exception as e:
            if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
                print("  run_id already exists on games, skipping")
            else:
                raise

        # Add run_id to notifications (nullable)
        try:
            await conn.execute(text("ALTER TABLE notifications ADD COLUMN run_id INTEGER REFERENCES runs(id)"))
            print("[OK] Added run_id column to notifications")
        except Exception as e:
            if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
                print("  run_id already exists on notifications, skipping")
            else:
                raise

        # Add run_id to player_ratings (nullable first, backfill later)
        try:
            await conn.execute(text("ALTER TABLE player_ratings ADD COLUMN run_id INTEGER REFERENCES runs(id)"))
            print("[OK] Added run_id column to player_ratings")
        except Exception as e:
            if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
                print("  run_id already exists on player_ratings, skipping")
            else:
                raise

        # Add run_id to algorithm_weights (nullable)
        try:
            await conn.execute(text("ALTER TABLE algorithm_weights ADD COLUMN run_id INTEGER REFERENCES runs(id)"))
            print("[OK] Added run_id column to algorithm_weights")
        except Exception as e:
            if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
                print("  run_id already exists on algorithm_weights, skipping")
            else:
                raise

        # Add run_id to custom_metrics (nullable)
        try:
            await conn.execute(text("ALTER TABLE custom_metrics ADD COLUMN run_id INTEGER REFERENCES runs(id)"))
            print("[OK] Added run_id column to custom_metrics")
        except Exception as e:
            if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
                print("  run_id already exists on custom_metrics, skipping")
            else:
                raise

    # Step 3: Create new tables (runs, run_memberships, run_admins, run_player_stats)
    async with engine.begin() as conn:
        # Only create tables that don't exist yet
        await conn.run_sync(Base.metadata.create_all)
        print("[OK] Created new tables (runs, run_memberships, run_admins, run_player_stats)")

    # Step 4: Create Default Run and migrate data
    async with async_session() as db:
        # Check if default run already exists
        result = await db.execute(text("SELECT id FROM runs WHERE name = 'Default Run'"))
        existing_run = result.scalar_one_or_none()

        if existing_run:
            default_run_id = existing_run
            print(f"  Default Run already exists (id={default_run_id}), skipping creation")
        else:
            # Create the default run using app settings
            await db.execute(text("""
                INSERT INTO runs (name, description, default_location, default_game_day,
                                  default_game_time, default_roster_size, default_num_teams,
                                  is_active, created_at, updated_at)
                VALUES ('Default Run', 'The original game series', 'TBD', 2,
                        '19:00', 16, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """))
            await db.flush()
            result = await db.execute(text("SELECT id FROM runs WHERE name = 'Default Run'"))
            default_run_id = result.scalar_one()
            print(f"[OK] Created Default Run (id={default_run_id})")

        # Step 4a: Assign all existing games to the default run
        result = await db.execute(text("UPDATE games SET run_id = :run_id WHERE run_id IS NULL"),
                                  {"run_id": default_run_id})
        print(f"[OK] Assigned {result.rowcount} games to Default Run")

        # Step 4b: Assign all existing player_ratings to the default run
        result = await db.execute(text("UPDATE player_ratings SET run_id = :run_id WHERE run_id IS NULL"),
                                  {"run_id": default_run_id})
        print(f"[OK] Assigned {result.rowcount} player_ratings to Default Run")

        # Step 4c: Assign all existing algorithm_weights to the default run
        result = await db.execute(text("UPDATE algorithm_weights SET run_id = :run_id WHERE run_id IS NULL"),
                                  {"run_id": default_run_id})
        print(f"[OK] Assigned {result.rowcount} algorithm_weights to Default Run")

        # Step 4d: Assign all existing custom_metrics to the default run
        result = await db.execute(text("UPDATE custom_metrics SET run_id = :run_id WHERE run_id IS NULL"),
                                  {"run_id": default_run_id})
        print(f"[OK] Assigned {result.rowcount} custom_metrics to Default Run")

        # Step 4e: Assign all existing notifications to the default run
        result = await db.execute(text("UPDATE notifications SET run_id = :run_id WHERE run_id IS NULL"),
                                  {"run_id": default_run_id})
        print(f"[OK] Assigned {result.rowcount} notifications to Default Run")

        # Step 4f: Create RunMemberships for all active users
        result = await db.execute(text("""
            SELECT id, player_status FROM users WHERE is_active = 1
        """))
        users = result.fetchall()

        memberships_created = 0
        for user_id, player_status in users:
            # Check if membership already exists
            existing = await db.execute(text(
                "SELECT id FROM run_memberships WHERE run_id = :run_id AND user_id = :user_id"
            ), {"run_id": default_run_id, "user_id": user_id})
            if existing.scalar_one_or_none():
                continue

            await db.execute(text("""
                INSERT INTO run_memberships (run_id, user_id, player_status, dues_paid,
                                             notify_email, notify_sms, joined_at)
                VALUES (:run_id, :user_id, :status, 0, 1, 1, CURRENT_TIMESTAMP)
            """), {
                "run_id": default_run_id,
                "user_id": user_id,
                "status": player_status if player_status else "pending",
            })
            memberships_created += 1
        print(f"[OK] Created {memberships_created} RunMemberships for Default Run")

        # Step 4g: Create RunPlayerStats for all active users
        stats_created = 0
        result = await db.execute(text("""
            SELECT id, games_played, games_won, win_rate,
                   avg_offense, avg_defense, avg_overall,
                   mvp_count, shaqtin_count, xfactor_count
            FROM users WHERE is_active = 1
        """))
        user_stats = result.fetchall()

        for row in user_stats:
            user_id = row[0]
            # Check if stats already exist
            existing = await db.execute(text(
                "SELECT id FROM run_player_stats WHERE run_id = :run_id AND user_id = :user_id"
            ), {"run_id": default_run_id, "user_id": user_id})
            if existing.scalar_one_or_none():
                continue

            await db.execute(text("""
                INSERT INTO run_player_stats (run_id, user_id, games_played, games_won,
                                              win_rate, avg_offense, avg_defense,
                                              avg_overall, mvp_count, shaqtin_count, xfactor_count)
                VALUES (:run_id, :user_id, :gp, :gw, :jf, :ao, :ad, :aov, :mvp, :shaq, :xf)
            """), {
                "run_id": default_run_id,
                "user_id": user_id,
                "gp": row[1] or 0,
                "gw": row[2] or 0,
                "jf": row[3] or 0.5,
                "ao": row[4] or 3.0,
                "ad": row[5] or 3.0,
                "aov": row[6] or 3.0,
                "mvp": row[7] or 0,
                "shaq": row[8] or 0,
                "xf": row[9] or 0,
            })
            stats_created += 1
        print(f"[OK] Created {stats_created} RunPlayerStats for Default Run")

        # Step 5: Set up admin roles
        # Alic (id=23) → SUPER_ADMIN
        await db.execute(text("UPDATE users SET role = 'SUPER_ADMIN' WHERE id = 23"))
        print("[OK] Set Alic (id=23) as SUPER_ADMIN")

        # Carey (id=16) → stays PLAYER (run admin via run_admins table)
        await db.execute(text("UPDATE users SET role = 'PLAYER' WHERE id = 16"))

        # All other former admins → PLAYER
        await db.execute(text("UPDATE users SET role = 'PLAYER' WHERE role = 'ADMIN' AND id NOT IN (23)"))
        print("[OK] Converted remaining ADMIN users to PLAYER")

        # Create RunAdmin entries for both Alic and Carey on the default run
        for admin_user_id in [23, 16]:
            existing = await db.execute(text(
                "SELECT id FROM run_admins WHERE run_id = :run_id AND user_id = :user_id"
            ), {"run_id": default_run_id, "user_id": admin_user_id})
            if not existing.scalar_one_or_none():
                await db.execute(text("""
                    INSERT INTO run_admins (run_id, user_id, created_at)
                    VALUES (:run_id, :user_id, CURRENT_TIMESTAMP)
                """), {"run_id": default_run_id, "user_id": admin_user_id})

        print("[OK] Created RunAdmin entries for Alic and Carey on Default Run")

        await db.commit()
        print("\n[DONE] Migration complete!")

        # Print summary
        result = await db.execute(text("SELECT COUNT(*) FROM runs"))
        run_count = result.scalar()
        result = await db.execute(text("SELECT COUNT(*) FROM run_memberships"))
        membership_count = result.scalar()
        result = await db.execute(text("SELECT COUNT(*) FROM run_admins"))
        admin_count = result.scalar()
        result = await db.execute(text("SELECT COUNT(*) FROM run_player_stats"))
        stats_count = result.scalar()

        print(f"\nSummary:")
        print(f"  Runs: {run_count}")
        print(f"  Run Memberships: {membership_count}")
        print(f"  Run Admins: {admin_count}")
        print(f"  Run Player Stats: {stats_count}")


if __name__ == "__main__":
    asyncio.run(migrate())
