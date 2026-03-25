"""Tests for authentication: register, login, JWT."""
import pytest
from tests.conftest import create_user, login_user, auth_header


@pytest.mark.asyncio
async def test_register_new_user(client):
    user, token = await create_user(client, make_admin=False)
    assert user["email"] == "test@test.com"
    assert user["full_name"] == "Test User"
    assert token


@pytest.mark.asyncio
async def test_register_duplicate_email(client):
    await create_user(client, make_admin=False)
    resp = await client.post("/api/auth/register", json={
        "full_name": "Dupe", "email": "test@test.com",
        "username": "dupe", "password": "Password123",
    })
    assert resp.status_code in (400, 409)
    assert "already" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_login_valid(client):
    await create_user(client, make_admin=False)
    token = await login_user(client)
    assert token


@pytest.mark.asyncio
async def test_login_wrong_password(client):
    await create_user(client, make_admin=False)
    resp = await client.post("/api/auth/login", json={
        "email": "test@test.com", "password": "WrongPass",
    })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_nonexistent_email(client):
    resp = await client.post("/api/auth/login", json={
        "email": "nobody@test.com", "password": "Password123",
    })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_protected_route_no_token(client):
    """Accessing a protected endpoint without a token should fail."""
    resp = await client.get("/api/notifications")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_protected_route_bad_token(client):
    resp = await client.get("/api/notifications", headers=auth_header("invalid.token.here"))
    assert resp.status_code in (401, 403)
