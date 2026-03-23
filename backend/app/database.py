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

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

# Create the async engine with connection pooling
# SQLite doesn't support pool_size/max_overflow, so we conditionally set them
_is_sqlite = settings.database_url.startswith("sqlite")
_engine_kwargs = {"echo": False}
if not _is_sqlite:
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
    """Create all tables on startup (development only).

    TEACHING NOTE:
        In production, use Alembic migrations instead of create_all().
        This is a convenience for local development.
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
