"""Tests for user creation: registration, login response, quick-add, import, and position."""
import pytest
from tests.conftest import create_user, create_run, auth_header, login_user


# =============================================================================
# Registration via invite code
# =============================================================================

@pytest.mark.asyncio
async def test_register_via_invite_code_returns_full_user(client):
    """Registration returns a token and a complete user response with all fields."""
    _, admin_token = await create_user(client, "Admin", "admin@test.com")
    run = await create_run(client, admin_token)

    # Generate invite code
    code_resp = await client.post(
        f"/api/runs/{run['id']}/admin/invite-codes",
        json={"label": "test"},
        headers=auth_header(admin_token),
    )
    code = code_resp.json()["code"]

    # Register
    resp = await client.post("/api/auth/register", json={
        "full_name": "New Player",
        "email": "newplayer@test.com",
        "username": "newplayer",
        "password": "Password123",
        "invite_code": code,
    })
    assert resp.status_code == 201
    data = resp.json()

    # Token present
    assert "access_token" in data
    assert data["token_type"] == "bearer"

    # User response shape
    user = data["user"]
    assert user["full_name"] == "New Player"
    assert user["email"] == "newplayer@test.com"
    assert user["username"] == "newplayer"
    assert user["role"] == "player"
    assert user["player_status"] == "pending"
    assert user["position"] == "Mascot"
    assert "player_rating" in user
    assert "created_at" in user
    assert isinstance(user["games_played"], int)
    assert isinstance(user["games_won"], int)
    assert isinstance(user["win_rate"], float)


@pytest.mark.asyncio
async def test_register_duplicate_email_rejected(client):
    """Registering with an already-used email fails."""
    _, admin_token = await create_user(client, "Admin", "admin@test.com")
    run = await create_run(client, admin_token)

    code_resp = await client.post(
        f"/api/runs/{run['id']}/admin/invite-codes",
        json={"label": "test"},
        headers=auth_header(admin_token),
    )
    code = code_resp.json()["code"]

    # First registration
    await client.post("/api/auth/register", json={
        "full_name": "First", "email": "dupe@test.com",
        "username": "first", "password": "Password123", "invite_code": code,
    })

    # Second registration with same email
    resp = await client.post("/api/auth/register", json={
        "full_name": "Second", "email": "dupe@test.com",
        "username": "second", "password": "Password123", "invite_code": code,
    })
    assert resp.status_code == 409


# =============================================================================
# Login response shape
# =============================================================================

@pytest.mark.asyncio
async def test_login_returns_full_user(client):
    """Login returns a complete user response with position and all stats."""
    await create_user(client, "Login User", "login@test.com", make_admin=False)

    resp = await client.post("/api/auth/login", json={
        "email": "login@test.com", "password": "Password123",
    })
    assert resp.status_code == 200
    data = resp.json()

    assert "access_token" in data
    user = data["user"]
    assert user["full_name"] == "Login User"
    assert user["position"] == "Mascot"
    assert "player_rating" in user
    assert "created_at" in user


# =============================================================================
# Quick-add player
# =============================================================================

@pytest.mark.asyncio
async def test_quick_add_player_default_position(client):
    """Quick-add creates a player with position=Mascot by default."""
    _, token = await create_user(client)
    run = await create_run(client, token)

    resp = await client.post(
        f"/api/runs/{run['id']}/admin/players/quick-add",
        json={"full_name": "Quick Add", "email": "quickadd@test.com"},
        headers=auth_header(token),
    )
    assert resp.status_code == 201

    # Verify the player in the list
    plist = await client.get(f"/api/runs/{run['id']}/players", headers=auth_header(token))
    player = next(u for u in plist.json()["users"] if u["email"] == "quickadd@test.com")
    assert player["position"] == "Mascot"


@pytest.mark.asyncio
async def test_quick_add_player_with_position(client):
    """Quick-add respects a provided position."""
    _, token = await create_user(client)
    run = await create_run(client, token)

    resp = await client.post(
        f"/api/runs/{run['id']}/admin/players/quick-add",
        json={"full_name": "Guard", "email": "guard@test.com", "position": "PG"},
        headers=auth_header(token),
    )
    assert resp.status_code == 201

    plist = await client.get(f"/api/runs/{run['id']}/players", headers=auth_header(token))
    player = next(u for u in plist.json()["users"] if u["email"] == "guard@test.com")
    assert player["position"] == "PG"


@pytest.mark.asyncio
async def test_quick_add_duplicate_email_rejected(client):
    """Quick-add rejects duplicate emails."""
    _, token = await create_user(client)
    run = await create_run(client, token)

    await client.post(
        f"/api/runs/{run['id']}/admin/players/quick-add",
        json={"full_name": "Player One", "email": "same@test.com"},
        headers=auth_header(token),
    )
    resp = await client.post(
        f"/api/runs/{run['id']}/admin/players/quick-add",
        json={"full_name": "Player Two", "email": "same@test.com"},
        headers=auth_header(token),
    )
    assert resp.status_code == 400


# =============================================================================
# Import players
# =============================================================================

@pytest.mark.asyncio
async def test_import_players_creates_with_default_position(client):
    """Imported players get position=Mascot."""
    _, token = await create_user(client)
    run = await create_run(client, token)

    resp = await client.post(
        f"/api/runs/{run['id']}/admin/import-players",
        json={"players": [
            {"name": "Import A", "email": "a@test.com", "wins": 5, "losses": 3},
            {"name": "Import B", "email": "b@test.com", "wins": 2, "losses": 8},
        ]},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["created_count"] == 2
    assert data["skipped_count"] == 0

    plist = await client.get(f"/api/runs/{run['id']}/players", headers=auth_header(token))
    users = plist.json()["users"]
    for u in users:
        if u["email"] in ("a@test.com", "b@test.com"):
            assert u["position"] == "Mascot"


@pytest.mark.asyncio
async def test_import_skips_existing_email(client):
    """Importing a player with an existing email skips them."""
    _, token = await create_user(client)
    run = await create_run(client, token)

    await client.post(
        f"/api/runs/{run['id']}/admin/import-players",
        json={"players": [{"name": "Exists", "email": "exists@test.com"}]},
        headers=auth_header(token),
    )

    resp = await client.post(
        f"/api/runs/{run['id']}/admin/import-players",
        json={"players": [{"name": "Exists Again", "email": "exists@test.com"}]},
        headers=auth_header(token),
    )
    assert resp.json()["skipped_count"] == 1
    assert resp.json()["created_count"] == 0


# =============================================================================
# Position updates
# =============================================================================

@pytest.mark.asyncio
async def test_update_own_position_single(client):
    """A player can update their own position."""
    _, token = await create_user(client, "Pos User", "pos@test.com", make_admin=False)

    resp = await client.patch(
        "/api/players/me",
        json={"position": "SG"},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    assert resp.json()["position"] == "SG"


@pytest.mark.asyncio
async def test_update_own_position_dual(client):
    """A player can set two positions."""
    _, token = await create_user(client, "Dual Pos", "dual@test.com", make_admin=False)

    resp = await client.patch(
        "/api/players/me",
        json={"position": "SF,PF"},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    assert resp.json()["position"] == "SF,PF"


@pytest.mark.asyncio
async def test_update_position_rejects_three(client):
    """Maximum 2 positions allowed."""
    _, token = await create_user(client, "Three Pos", "three@test.com", make_admin=False)

    resp = await client.patch(
        "/api/players/me",
        json={"position": "PG,SG,SF"},
        headers=auth_header(token),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_update_position_rejects_invalid(client):
    """Invalid position names are rejected."""
    _, token = await create_user(client, "Bad Pos", "badpos@test.com", make_admin=False)

    resp = await client.patch(
        "/api/players/me",
        json={"position": "QB"},
        headers=auth_header(token),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_admin_update_player_position(client):
    """Admin can update another player's position."""
    _, admin_token = await create_user(client, "Admin", "admin@test.com")
    run = await create_run(client, admin_token)

    # Import a player
    await client.post(
        f"/api/runs/{run['id']}/admin/import-players",
        json={"players": [{"name": "Target", "email": "target@test.com"}]},
        headers=auth_header(admin_token),
    )
    plist = await client.get(f"/api/runs/{run['id']}/players", headers=auth_header(admin_token))
    player = next(u for u in plist.json()["users"] if u["email"] == "target@test.com")

    resp = await client.patch(
        f"/api/runs/{run['id']}/admin/players/{player['id']}",
        json={"position": "C"},
        headers=auth_header(admin_token),
    )
    assert resp.status_code == 200
    assert resp.json()["position"] == "C"
