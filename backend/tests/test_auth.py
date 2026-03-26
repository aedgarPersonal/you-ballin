"""Tests for authentication: register, login, JWT, invite codes."""
import pytest
from tests.conftest import create_user, login_user, auth_header


@pytest.mark.asyncio
async def test_register_without_code_rejected(client):
    """Registration without an invite code should be rejected."""
    resp = await client.post("/api/auth/register", json={
        "full_name": "No Code", "email": "nocode@test.com",
        "username": "nocode", "password": "Password123",
    })
    assert resp.status_code == 403
    assert "invite" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_register_with_invalid_code(client):
    resp = await client.post("/api/auth/register", json={
        "full_name": "Bad Code", "email": "bad@test.com",
        "username": "bad", "password": "Password123",
        "invite_code": "INVALID123",
    })
    assert resp.status_code == 400


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
    resp = await client.get("/api/notifications")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_protected_route_bad_token(client):
    resp = await client.get("/api/notifications", headers=auth_header("invalid.token.here"))
    assert resp.status_code in (401, 403)
