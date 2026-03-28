"""Tests for player management: delete, reset password, status changes, approve/deny, profile update."""
import pytest
from tests.conftest import create_user, create_run, auth_header, login_user


async def _import_player(client, run_id, token, name="Imported Player", email="imported@test.com"):
    """Import a single player and return their user data from the player list."""
    resp = await client.post(
        f"/api/runs/{run_id}/admin/import-players",
        json={"players": [{"name": name, "email": email, "wins": 10, "losses": 5}]},
        headers=auth_header(token),
    )
    assert resp.json()["created_count"] == 1

    # Find the imported player in the player list
    plist = await client.get(f"/api/runs/{run_id}/players", headers=auth_header(token))
    users = plist.json()["users"]
    player = next(u for u in users if u["full_name"] == name)
    return player


@pytest.mark.asyncio
async def test_delete_player(client):
    """DELETE /runs/{id}/admin/players/{uid} removes the player."""
    _, token = await create_user(client)
    run = await create_run(client, token)
    player = await _import_player(client, run["id"], token)

    resp = await client.delete(
        f"/api/runs/{run['id']}/admin/players/{player['id']}",
        headers=auth_header(token),
    )
    assert resp.status_code == 204

    # Verify player is gone from the player list
    plist = await client.get(f"/api/runs/{run['id']}/players", headers=auth_header(token))
    user_ids = [u["id"] for u in plist.json()["users"]]
    assert player["id"] not in user_ids


@pytest.mark.asyncio
async def test_admin_reset_player_password(client):
    """POST /runs/{id}/admin/players/{uid}/reset-password resets to Password123."""
    _, admin_token = await create_user(client, "Admin", "admin@test.com")
    run = await create_run(client, admin_token)

    # Import a player
    player = await _import_player(client, run["id"], admin_token, "ResetMe", "resetme@test.com")

    # Change password by logging in and then the admin resets it
    resp = await client.post(
        f"/api/runs/{run['id']}/admin/players/{player['id']}/reset-password",
        headers=auth_header(admin_token),
    )
    assert resp.status_code == 200
    assert "reset" in resp.json()["message"].lower()

    # Verify login with Password123 works
    login_resp = await client.post("/api/auth/login", json={
        "email": "resetme@test.com",
        "password": "Password123",
    })
    assert login_resp.status_code == 200
    assert "access_token" in login_resp.json()


@pytest.mark.asyncio
async def test_update_player_status_regular_to_dropin(client):
    """PATCH /runs/{id}/admin/players/{uid} with player_status=dropin changes status."""
    _, token = await create_user(client)
    run = await create_run(client, token)
    player = await _import_player(client, run["id"], token)

    resp = await client.patch(
        f"/api/runs/{run['id']}/admin/players/{player['id']}",
        json={"player_status": "dropin"},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    assert resp.json()["player_status"] == "dropin"


@pytest.mark.asyncio
async def test_update_player_status_dropin_to_inactive(client):
    """Change player status from dropin to inactive."""
    _, token = await create_user(client)
    run = await create_run(client, token)
    player = await _import_player(client, run["id"], token)

    # First change to dropin
    await client.patch(
        f"/api/runs/{run['id']}/admin/players/{player['id']}",
        json={"player_status": "dropin"},
        headers=auth_header(token),
    )

    # Then change to inactive
    resp = await client.patch(
        f"/api/runs/{run['id']}/admin/players/{player['id']}",
        json={"player_status": "inactive"},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    assert resp.json()["player_status"] == "inactive"


@pytest.mark.asyncio
async def test_approve_pending_player(client):
    """Register via invite code, then approve the pending membership."""
    _, admin_token = await create_user(client, "Admin", "admin@test.com")
    run = await create_run(client, admin_token)

    # Generate invite code
    code_resp = await client.post(
        f"/api/runs/{run['id']}/admin/invite-codes",
        json={"label": "test"},
        headers=auth_header(admin_token),
    )
    assert code_resp.status_code == 200
    code = code_resp.json()["code"]

    # Register a new user with the invite code
    reg_resp = await client.post("/api/auth/register", json={
        "full_name": "Pending User",
        "email": "pending@test.com",
        "username": "pendinguser",
        "password": "Password123",
        "invite_code": code,
    })
    assert reg_resp.status_code == 201
    new_user_id = reg_resp.json()["user"]["id"]

    # Approve the pending player
    approve_resp = await client.post(
        f"/api/runs/{run['id']}/admin/approve/{new_user_id}",
        headers=auth_header(admin_token),
    )
    assert approve_resp.status_code == 200
    assert approve_resp.json()["player_status"] == "regular"


@pytest.mark.asyncio
async def test_deny_pending_player(client):
    """Register via invite code, then deny the pending membership."""
    _, admin_token = await create_user(client, "Admin", "admin@test.com")
    run = await create_run(client, admin_token)

    # Generate invite code
    code_resp = await client.post(
        f"/api/runs/{run['id']}/admin/invite-codes",
        json={"label": "test"},
        headers=auth_header(admin_token),
    )
    code = code_resp.json()["code"]

    # Register a new user with the invite code
    reg_resp = await client.post("/api/auth/register", json={
        "full_name": "Deny Me",
        "email": "denyme@test.com",
        "username": "denyme",
        "password": "Password123",
        "invite_code": code,
    })
    assert reg_resp.status_code == 201
    new_user_id = reg_resp.json()["user"]["id"]

    # Deny the pending player
    deny_resp = await client.post(
        f"/api/runs/{run['id']}/admin/deny/{new_user_id}",
        headers=auth_header(admin_token),
    )
    assert deny_resp.status_code == 200
    # Deny endpoint returns the user (membership status is set on RunMembership, not User)
    assert deny_resp.json()["id"] == new_user_id


@pytest.mark.asyncio
async def test_update_own_profile(client):
    """PATCH /api/players/me updates the current user's email and phone."""
    user, token = await create_user(client, "Self Updater", "self@test.com")

    resp = await client.patch(
        "/api/players/me",
        json={"email": "newemail@test.com", "phone": "555-1234"},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "newemail@test.com"
    assert data["phone"] == "555-1234"
