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
    """Register a user and return (user_data, token). By default promotes to super_admin."""
    resp = await client.post("/api/auth/register", json={
        "full_name": name,
        "email": email,
        "username": email.split("@")[0],
        "password": password,
    })
    assert resp.status_code == 201, f"Register failed: {resp.text}"
    data = resp.json()

    if make_admin:
        # Promote to super_admin via direct DB update
        from sqlalchemy import update as sql_update
        from app.models.user import User, UserRole
        async with TestSession() as session:
            await session.execute(
                sql_update(User).where(User.email == email).values(role=UserRole.SUPER_ADMIN)
            )
            await session.commit()
        # Re-login to get updated token with new role
        login_resp = await client.post("/api/auth/login", json={"email": email, "password": password})
        data["access_token"] = login_resp.json()["access_token"]

    return data["user"], data["access_token"]


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
