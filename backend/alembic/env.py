"""
Alembic Migration Environment
=============================
Configures Alembic to use our SQLAlchemy models and async engine.

TEACHING NOTE:
    Alembic is the migration tool for SQLAlchemy. It tracks changes to
    your models and generates SQL to update the database schema.

    Common commands:
        alembic revision --autogenerate -m "description"  # Create migration
        alembic upgrade head                               # Apply all migrations
        alembic downgrade -1                               # Undo last migration
"""

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.config import settings
from app.database import Base

# Import all models so Alembic can detect them
from app.models.user import User  # noqa: F401
from app.models.game import Game, RSVP  # noqa: F401
from app.models.team import TeamAssignment, GameResult  # noqa: F401
from app.models.rating import PlayerRating  # noqa: F401
from app.models.notification import Notification  # noqa: F401
from app.models.vote import GameVote  # noqa: F401

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# Override the sqlalchemy.url with our settings
config.set_main_option("sqlalchemy.url", settings.database_url)


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (generates SQL without connecting)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Run migrations in 'online' mode with async engine."""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    """Entry point for online migrations."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
