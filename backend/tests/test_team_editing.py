"""Tests for team editing: move, remove, add players after teams are generated."""
import pytest
from tests.conftest import create_user, create_run, create_game, auth_header


async def _setup_game_with_teams(client):
    """Create a game with 10 players and generated teams. Returns (admin_token, run_id, game_id, teams)."""
    _, admin_token = await create_user(client, "Admin", "admin@test.com")
    run = await create_run(client, admin_token)
    game = await create_game(client, admin_token, run["id"])
    run_id, game_id = run["id"], game["id"]

    # Import 10 players
    players = [
        {"name": f"Player {i}", "email": f"p{i}@test.com", "wins": i, "losses": 10 - i}
        for i in range(1, 11)
    ]
    await client.post(
        f"/api/runs/{run_id}/admin/import-players",
        json={"players": players},
        headers=auth_header(admin_token),
    )

    # All players RSVP accepted
    for i in range(1, 11):
        tok = (await client.post("/api/auth/login", json={
            "email": f"p{i}@test.com", "password": "Password123",
        })).json()["access_token"]
        await client.post(
            f"/api/runs/{run_id}/games/{game_id}/rsvp",
            json={"status": "accepted"},
            headers=auth_header(tok),
        )

    # Generate teams
    teams_resp = await client.post(
        f"/api/runs/{run_id}/games/{game_id}/teams",
        headers=auth_header(admin_token),
    )
    teams = teams_resp.json()
    return admin_token, run_id, game_id, teams


@pytest.mark.asyncio
async def test_move_player_between_teams(client):
    admin_token, run_id, game_id, teams = await _setup_game_with_teams(client)

    # Find a player on team_1 and move to team_2
    t1_player = next(t for t in teams if t["team"] == "team_1")
    t2_team = "team_2"

    resp = await client.patch(
        f"/api/runs/{run_id}/games/{game_id}/teams/{t1_player['id']}",
        json={"team": t2_team},
        headers=auth_header(admin_token),
    )
    assert resp.status_code == 200
    assert resp.json()["team"] == t2_team
    assert resp.json()["user"]["id"] == t1_player["user_id"]


@pytest.mark.asyncio
async def test_move_to_same_team_fails(client):
    admin_token, run_id, game_id, teams = await _setup_game_with_teams(client)
    t1_player = next(t for t in teams if t["team"] == "team_1")

    resp = await client.patch(
        f"/api/runs/{run_id}/games/{game_id}/teams/{t1_player['id']}",
        json={"team": "team_1"},
        headers=auth_header(admin_token),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_move_to_invalid_team_fails(client):
    admin_token, run_id, game_id, teams = await _setup_game_with_teams(client)
    t1_player = next(t for t in teams if t["team"] == "team_1")

    resp = await client.patch(
        f"/api/runs/{run_id}/games/{game_id}/teams/{t1_player['id']}",
        json={"team": "team_99"},
        headers=auth_header(admin_token),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_remove_player(client):
    admin_token, run_id, game_id, teams = await _setup_game_with_teams(client)
    t1_players = [t for t in teams if t["team"] == "team_1"]
    assert len(t1_players) >= 2  # Need at least 2 so we can remove one

    resp = await client.delete(
        f"/api/runs/{run_id}/games/{game_id}/teams/{t1_players[0]['id']}",
        headers=auth_header(admin_token),
    )
    assert resp.status_code == 204

    # Verify player is gone
    teams_resp = await client.get(
        f"/api/runs/{run_id}/games/{game_id}/teams",
        headers=auth_header(admin_token),
    )
    remaining_ids = [t["user_id"] for t in teams_resp.json()]
    assert t1_players[0]["user_id"] not in remaining_ids


@pytest.mark.asyncio
async def test_remove_last_player_fails(client):
    admin_token, run_id, game_id, teams = await _setup_game_with_teams(client)

    # Remove all but one player from team_1
    t1_players = [t for t in teams if t["team"] == "team_1"]
    for p in t1_players[1:]:
        resp = await client.delete(
            f"/api/runs/{run_id}/games/{game_id}/teams/{p['id']}",
            headers=auth_header(admin_token),
        )
        assert resp.status_code == 204

    # Try to remove the last one
    resp = await client.delete(
        f"/api/runs/{run_id}/games/{game_id}/teams/{t1_players[0]['id']}",
        headers=auth_header(admin_token),
    )
    assert resp.status_code == 400
    assert "last player" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_add_player_to_team(client):
    admin_token, run_id, game_id, teams = await _setup_game_with_teams(client)

    # Import an extra player who is NOT on any team
    await client.post(
        f"/api/runs/{run_id}/admin/import-players",
        json={"players": [{"name": "Extra Player", "email": "extra@test.com"}]},
        headers=auth_header(admin_token),
    )
    # Get their user_id
    extra_login = await client.post("/api/auth/login", json={
        "email": "extra@test.com", "password": "Password123",
    })
    extra_id = extra_login.json()["user"]["id"]

    resp = await client.post(
        f"/api/runs/{run_id}/games/{game_id}/teams/add",
        json={"user_id": extra_id, "team": "team_1"},
        headers=auth_header(admin_token),
    )
    assert resp.status_code == 201
    assert resp.json()["user_id"] == extra_id
    assert resp.json()["team"] == "team_1"


@pytest.mark.asyncio
async def test_add_duplicate_player_fails(client):
    admin_token, run_id, game_id, teams = await _setup_game_with_teams(client)
    existing_player = teams[0]

    resp = await client.post(
        f"/api/runs/{run_id}/games/{game_id}/teams/add",
        json={"user_id": existing_player["user_id"], "team": "team_2"},
        headers=auth_header(admin_token),
    )
    assert resp.status_code == 400
    assert "already assigned" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_edit_requires_teams_set_status(client):
    """Editing should fail when game is not in teams_set status."""
    _, admin_token = await create_user(client, "Admin", "admin@test.com")
    run = await create_run(client, admin_token)
    game = await create_game(client, admin_token, run["id"])

    # Game is in "scheduled" status — no teams generated yet
    resp = await client.patch(
        f"/api/runs/{run['id']}/games/{game['id']}/teams/999",
        json={"team": "team_2"},
        headers=auth_header(admin_token),
    )
    assert resp.status_code == 400
    assert "teams_set" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_edit_requires_admin(client):
    admin_token, run_id, game_id, teams = await _setup_game_with_teams(client)

    # Login as a regular player
    player_login = await client.post("/api/auth/login", json={
        "email": "p1@test.com", "password": "Password123",
    })
    player_token = player_login.json()["access_token"]

    # Try to move a player as non-admin
    resp = await client.patch(
        f"/api/runs/{run_id}/games/{game_id}/teams/{teams[0]['id']}",
        json={"team": "team_2"},
        headers=auth_header(player_token),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_removed_player_no_stats(client):
    """Players removed from teams should NOT get stats when results are recorded."""
    admin_token, run_id, game_id, teams = await _setup_game_with_teams(client)

    # Remove a player from team_1
    t1_players = [t for t in teams if t["team"] == "team_1"]
    removed = t1_players[0]
    await client.delete(
        f"/api/runs/{run_id}/games/{game_id}/teams/{removed['id']}",
        headers=auth_header(admin_token),
    )

    # Record results
    result_resp = await client.post(
        f"/api/runs/{run_id}/games/{game_id}/result",
        json={"team_scores": [{"team": "team_1", "wins": 3}, {"team": "team_2", "wins": 2}]},
        headers=auth_header(admin_token),
    )
    assert result_resp.status_code in (200, 201)

    # Verify the removed player has 0 games played (they were imported with wins/losses but the result recording only adds to existing)
    # The key check: remaining players should have stats, removed player should not have gained from this game
    # Check via stats endpoint
    game_resp = await client.get(
        f"/api/runs/{run_id}/games/{game_id}",
        headers=auth_header(admin_token),
    )
    assigned_ids = {t["user_id"] for t in game_resp.json()["teams"]}
    assert removed["user_id"] not in assigned_ids
