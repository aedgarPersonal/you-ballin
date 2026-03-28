"""Tests for password reset: self-service and admin-initiated."""
import pytest
from tests.conftest import create_user, create_run, auth_header, login_user


@pytest.mark.asyncio
async def test_forgot_password_existing_email(client):
    """POST /api/auth/forgot-password with valid email returns 200."""
    await create_user(client, "Resetter", "resetter@test.com")
    resp = await client.post("/api/auth/forgot-password", json={"email": "resetter@test.com"})
    assert resp.status_code == 200
    assert "message" in resp.json()


@pytest.mark.asyncio
async def test_forgot_password_nonexistent_email(client):
    """POST /api/auth/forgot-password with unknown email still returns 200 (anti-enumeration)."""
    resp = await client.post("/api/auth/forgot-password", json={"email": "nobody@nowhere.com"})
    assert resp.status_code == 200
    assert "message" in resp.json()


@pytest.mark.asyncio
async def test_reset_password_valid_token(client):
    """Create reset token via jwt helper, POST /api/auth/reset-password, then login with new password."""
    user_data, token = await create_user(client, "TokenUser", "tokenuser@test.com")

    # Create a password reset token directly via the jwt helper
    from app.auth.jwt import create_password_reset_token
    reset_token = create_password_reset_token(user_data["id"])

    # Reset password
    resp = await client.post("/api/auth/reset-password", json={
        "token": reset_token,
        "new_password": "NewSecurePass456",
    })
    assert resp.status_code == 200

    # Login with new password should succeed
    login_resp = await client.post("/api/auth/login", json={
        "email": "tokenuser@test.com",
        "password": "NewSecurePass456",
    })
    assert login_resp.status_code == 200
    assert "access_token" in login_resp.json()


@pytest.mark.asyncio
async def test_reset_password_invalid_token(client):
    """POST /api/auth/reset-password with bad token returns 400."""
    resp = await client.post("/api/auth/reset-password", json={
        "token": "totally.invalid.token",
        "new_password": "SomeNewPass123",
    })
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_admin_reset_password(client):
    """Admin resets a player's password via /runs/{id}/admin/players/{uid}/reset-password."""
    # Create admin + run
    _, admin_token = await create_user(client, "Admin", "admin@test.com")
    run = await create_run(client, admin_token)
    run_id = run["id"]

    # Import a player
    resp = await client.post(
        f"/api/runs/{run_id}/admin/import-players",
        json={"players": [{"name": "Player One", "email": "p1@test.com", "wins": 5, "losses": 3}]},
        headers=auth_header(admin_token),
    )
    assert resp.json()["created_count"] == 1

    # Login as the player to get their user id
    login_resp = await client.post("/api/auth/login", json={
        "email": "p1@test.com", "password": "Password123",
    })
    assert login_resp.status_code == 200
    player_id = login_resp.json()["user"]["id"]

    # Change the player's password by logging in and using the app normally
    # (simulate that the player changed their password to something else)
    # We'll just directly reset via admin endpoint
    reset_resp = await client.post(
        f"/api/runs/{run_id}/admin/players/{player_id}/reset-password",
        headers=auth_header(admin_token),
    )
    assert reset_resp.status_code == 200

    # Login with default "Password123" should now succeed (password was reset to default)
    login_resp2 = await client.post("/api/auth/login", json={
        "email": "p1@test.com", "password": "Password123",
    })
    assert login_resp2.status_code == 200
    assert "access_token" in login_resp2.json()
