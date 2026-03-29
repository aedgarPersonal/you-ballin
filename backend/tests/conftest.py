"""
Test fixtures for You Ballin API tests.
Uses an in-memory SQLite database for isolation.
"""
import asyncio
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.database import Base, get_db
import app.models.season  # noqa: F401 — ensure season tables are registered
import app.models.rating  # noqa: F401 — ensure rating tables are registered
from app.main import app


# Use in-memory SQLite for tests
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSession = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    """Create all tables before each test, drop after."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def _override_get_db():
    async with TestSession() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


app.dependency_overrides[get_db] = _override_get_db


@pytest_asyncio.fixture
async def client():
    """Async HTTP client for testing."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def db():
    """Direct DB session for test setup."""
    async with TestSession() as session:
        yield session
        await session.commit()


# =============================================================================
# Helper functions for creating test data
# =============================================================================

async def create_user(client: AsyncClient, name="Test User", email="test@test.com", password="Password123", make_admin=True):
    """Create a user directly in DB (bypasses invite code requirement). By default promotes to super_admin."""
    from app.auth.password import hash_password
    from app.auth.jwt import create_access_token
    from app.models.user import User, UserRole, PlayerStatus

    role = UserRole.SUPER_ADMIN if make_admin else UserRole.PLAYER

    async with TestSession() as session:
        user = User(
            email=email,
            username=email.split("@")[0],
            hashed_password=hash_password(password),
            full_name=name,
            role=role,
            player_status=PlayerStatus.PENDING if not make_admin else PlayerStatus.REGULAR,
            avatar_url="bensimmons",
            position="Mascot",
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)

        token = create_access_token(user.id)
        user_data = {
            "id": user.id,
            "email": user.email,
            "username": user.username,
            "full_name": user.full_name,
            "role": user.role.value if hasattr(user.role, 'value') else user.role,
        }
        return user_data, token


async def login_user(client: AsyncClient, email="test@test.com", password="Password123"):
    """Login and return token."""
    resp = await client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return resp.json()["access_token"]


def auth_header(token: str):
    """Build auth header dict."""
    return {"Authorization": f"Bearer {token}"}


async def create_run(client: AsyncClient, token: str, name="Test Run"):
    """Create a run and return its data."""
    resp = await client.post("/api/runs", json={
        "name": name,
        "default_location": "Test Gym",
        "default_day_of_week": "monday",
        "default_time": "20:00",
    }, headers=auth_header(token))
    assert resp.status_code == 201, f"Create run failed: {resp.text}"
    return resp.json()


async def create_game(client: AsyncClient, token: str, run_id: int, title="Test Game"):
    """Create a game in a run."""
    resp = await client.post(f"/api/runs/{run_id}/games", json={
        "title": title,
        "game_date": "2026-04-01T20:00:00",
        "location": "Test Gym",
    }, headers=auth_header(token))
    assert resp.status_code == 201, f"Create game failed: {resp.text}"
    return resp.json()
