"""
Database Connection Setup
=========================
Creates the async SQLAlchemy engine and session factory.

TEACHING NOTE:
    We use async SQLAlchemy (with asyncpg driver) for non-blocking database
    operations. This means our API can handle many concurrent requests without
    blocking on database I/O.

    Key concepts:
    - Engine: manages the connection pool to PostgreSQL
    - AsyncSession: a single "conversation" with the database
    - get_db(): a FastAPI dependency that provides a session per request
      and automatically handles commit/rollback
"""

import logging
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from app.config import settings

logger = logging.getLogger(__name__)

# Create the async engine
# When using Supabase transaction pooler (pgbouncer), we must disable
# prepared statement caching and use NullPool since pgbouncer manages pooling.
_is_sqlite = settings.database_url.startswith("sqlite")
_engine_kwargs: dict = {"echo": False}
if not _is_sqlite:
    _is_pooler = "pooler.supabase.com" in settings.database_url
    if _is_pooler:
        _engine_kwargs.update(
            poolclass=NullPool,
            connect_args={
                "statement_cache_size": 0,
                "prepared_statement_cache_size": 0,
                "prepared_statement_name_func": lambda: f"__asyncpg_{uuid4()}__",
            },
        )
    else:
        _engine_kwargs.update(pool_size=5, max_overflow=10, pool_pre_ping=True)

engine = create_async_engine(settings.database_url, **_engine_kwargs)

# Session factory - creates new sessions on demand
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models.

    TEACHING NOTE:
        All models inherit from this class. SQLAlchemy uses it to track
        which tables exist and to generate migrations via Alembic.
    """
    pass


async def get_db():
    """FastAPI dependency that provides a database session.

    TEACHING NOTE:
        This is a generator dependency. FastAPI calls it before each request
        handler, yielding a session. After the handler completes:
        - If no exception: the session is committed
        - If an exception: the session is rolled back
        - Either way: the session is closed

    Usage in a route:
        @router.get("/items")
        async def get_items(db: AsyncSession = Depends(get_db)):
            ...
    """
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    """Create all tables on startup and seed the super admin account."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Seed super admin if not exists
    await _seed_super_admin()


async def _seed_super_admin():
    """Create the default super admin account if it doesn't already exist."""
    from app.auth.password import hash_password
    from app.models.user import PlayerStatus, User, UserRole

    async with async_session() as session:
        result = await session.execute(select(User).where(User.username == "super_admin"))
        if result.scalar_one_or_none() is not None:
            return

        admin = User(
            email="admin@youballin.app",
            username="super_admin",
            full_name="Super Admin",
            hashed_password=hash_password("Super123"),
            role=UserRole.SUPER_ADMIN,
            player_status=PlayerStatus.REGULAR,
        )
        session.add(admin)
        await session.commit()
        logger.info("Seeded super admin account (super_admin)")
