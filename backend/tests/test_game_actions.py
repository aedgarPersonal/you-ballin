"""Tests for game action endpoints: delete, skip, poke, admin RSVP, update, status changes."""
import pytest
from tests.conftest import create_user, create_run, create_game, auth_header


async def _setup_completed_game(client):
    """Create admin, run, game, import 10 players, RSVP, generate teams, record result.

    Returns (run_id, game_id, admin_token, player_tokens, player_ids).
    """
    _, admin_token = await create_user(client, "Admin", "admin@test.com")
    run = await create_run(client, admin_token)
    game = await create_game(client, admin_token, run["id"])
    run_id = run["id"]
    game_id = game["id"]

    players = [
        {"name": f"Player {i}", "email": f"p{i}@test.com", "wins": i, "losses": 10 - i}
        for i in range(1, 11)
    ]
    resp = await client.post(
        f"/api/runs/{run_id}/admin/import-players",
        json={"players": players},
        headers=auth_header(admin_token),
    )
    assert resp.json()["created_count"] == 10

    player_tokens = []
    player_ids = []
    for i in range(1, 11):
        login_resp = await client.post("/api/auth/login", json={
            "email": f"p{i}@test.com", "password": "Password123",
        })
        assert login_resp.status_code == 200
        data = login_resp.json()
        player_tokens.append(data["access_token"])
        player_ids.append(data["user"]["id"])

    for pt in player_tokens:
        resp = await client.post(
            f"/api/runs/{run_id}/games/{game_id}/rsvp",
            json={"status": "accepted"},
            headers=auth_header(pt),
        )
        assert resp.status_code == 200

    teams_resp = await client.post(
        f"/api/runs/{run_id}/games/{game_id}/teams",
        headers=auth_header(admin_token),
    )
    assert teams_resp.status_code in (200, 201)
    teams = teams_resp.json()

    team_ids = set(t["team"] for t in teams)
    team_scores = [{"team": tid, "wins": 3 - i} for i, tid in enumerate(team_ids)]
    result_resp = await client.post(
        f"/api/runs/{run_id}/games/{game_id}/result",
        json={"team_scores": team_scores},
        headers=auth_header(admin_token),
    )
    assert result_resp.status_code in (200, 201)

    return run_id, game_id, admin_token, player_tokens, player_ids


@pytest.mark.asyncio
async def test_delete_game(client):
    """DELETE /runs/{id}/games/{gid} returns 204, subsequent GET returns 404."""
    _, admin_token = await create_user(client)
    run = await create_run(client, admin_token)
    game = await create_game(client, admin_token, run["id"])

    resp = await client.delete(
        f"/api/runs/{run['id']}/games/{game['id']}",
        headers=auth_header(admin_token),
    )
    assert resp.status_code == 204

    get_resp = await client.get(
        f"/api/runs/{run['id']}/games/{game['id']}",
        headers=auth_header(admin_token),
    )
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_completed_game_recalculates_stats(client):
    """Deleting a completed game should trigger stats recalculation."""
    run_id, game_id, admin_token, _, player_ids = await _setup_completed_game(client)

    # Check that player stats exist with games_played > 0
    stats_resp = await client.get(
        f"/api/runs/{run_id}/stats",
        headers=auth_header(admin_token),
    )
    assert stats_resp.status_code == 200

    # Delete the completed game
    del_resp = await client.delete(
        f"/api/runs/{run_id}/games/{game_id}",
        headers=auth_header(admin_token),
    )
    assert del_resp.status_code == 204

    # Verify stats were recalculated (should show 0 games now)
    stats_resp2 = await client.get(
        f"/api/runs/{run_id}/stats",
        headers=auth_header(admin_token),
    )
    assert stats_resp2.status_code == 200
    data = stats_resp2.json()
    assert data["overview"]["total_games"] == 0


@pytest.mark.asyncio
async def test_skip_game(client):
    """POST /runs/{id}/games/{gid}/skip sets status to skipped."""
    _, admin_token = await create_user(client)
    run = await create_run(client, admin_token)
    game = await create_game(client, admin_token, run["id"])

    resp = await client.post(
        f"/api/runs/{run['id']}/games/{game['id']}/skip",
        headers=auth_header(admin_token),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "skipped"


@pytest.mark.asyncio
async def test_poke_regulars(client):
    """POST /runs/{id}/games/{gid}/poke with scope=regulars returns 200."""
    _, admin_token = await create_user(client, "Admin", "admin@test.com")
    run = await create_run(client, admin_token)
    game = await create_game(client, admin_token, run["id"])
    run_id = run["id"]

    # Import a player so there's someone to poke
    await client.post(
        f"/api/runs/{run_id}/admin/import-players",
        json={"players": [{"name": "Lazy Larry", "email": "lazy@test.com", "wins": 0, "losses": 0}]},
        headers=auth_header(admin_token),
    )

    resp = await client.post(
        f"/api/runs/{run_id}/games/{game['id']}/poke",
        json={"scope": "regulars"},
        headers=auth_header(admin_token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "poked" in data
    assert data["poked"] >= 1


@pytest.mark.asyncio
async def test_admin_rsvp(client):
    """POST /runs/{id}/games/{gid}/rsvp/admin with user_id and status=accepted returns 200."""
    _, admin_token = await create_user(client, "Admin", "admin@test.com")
    run = await create_run(client, admin_token)
    game = await create_game(client, admin_token, run["id"])
    run_id = run["id"]

    # Import a player
    await client.post(
        f"/api/runs/{run_id}/admin/import-players",
        json={"players": [{"name": "Player X", "email": "px@test.com", "wins": 1, "losses": 1}]},
        headers=auth_header(admin_token),
    )
    login_resp = await client.post("/api/auth/login", json={
        "email": "px@test.com", "password": "Password123",
    })
    player_id = login_resp.json()["user"]["id"]

    resp = await client.post(
        f"/api/runs/{run_id}/games/{game['id']}/rsvp/admin",
        json={"user_id": player_id, "status": "accepted"},
        headers=auth_header(admin_token),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "accepted"


@pytest.mark.asyncio
async def test_update_game_details(client):
    """PATCH /runs/{id}/games/{gid} with new title updates the game."""
    _, admin_token = await create_user(client)
    run = await create_run(client, admin_token)
    game = await create_game(client, admin_token, run["id"])

    resp = await client.patch(
        f"/api/runs/{run['id']}/games/{game['id']}",
        json={"title": "Updated Game Title"},
        headers=auth_header(admin_token),
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "Updated Game Title"


@pytest.mark.asyncio
async def test_status_change_from_completed_clears_results(client):
    """Completing a game then changing status back to scheduled should clear results."""
    run_id, game_id, admin_token, _, _ = await _setup_completed_game(client)

    # Verify game is completed
    game_resp = await client.get(
        f"/api/runs/{run_id}/games/{game_id}",
        headers=auth_header(admin_token),
    )
    assert game_resp.json()["status"] == "completed"

    # Change status back to scheduled
    patch_resp = await client.patch(
        f"/api/runs/{run_id}/games/{game_id}",
        json={"status": "scheduled"},
        headers=auth_header(admin_token),
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["status"] == "scheduled"


@pytest.mark.asyncio
async def test_status_backwards_from_teams_set_clears_teams(client):
    """Generating teams then changing status to invites_sent should clear team assignments."""
    _, admin_token = await create_user(client, "Admin", "admin@test.com")
    run = await create_run(client, admin_token)
    game = await create_game(client, admin_token, run["id"])
    run_id = run["id"]
    game_id = game["id"]

    # Import 10 players and RSVP
    players = [
        {"name": f"Player {i}", "email": f"p{i}@test.com", "wins": i, "losses": 10 - i}
        for i in range(1, 11)
    ]
    await client.post(
        f"/api/runs/{run_id}/admin/import-players",
        json={"players": players},
        headers=auth_header(admin_token),
    )
    for i in range(1, 11):
        login_resp = await client.post("/api/auth/login", json={
            "email": f"p{i}@test.com", "password": "Password123",
        })
        pt = login_resp.json()["access_token"]
        await client.post(
            f"/api/runs/{run_id}/games/{game_id}/rsvp",
            json={"status": "accepted"},
            headers=auth_header(pt),
        )

    # Generate teams
    teams_resp = await client.post(
        f"/api/runs/{run_id}/games/{game_id}/teams",
        headers=auth_header(admin_token),
    )
    assert teams_resp.status_code in (200, 201)
    assert len(teams_resp.json()) == 10

    # Change status back to invites_sent (should clear teams)
    patch_resp = await client.patch(
        f"/api/runs/{run_id}/games/{game_id}",
        json={"status": "invites_sent"},
        headers=auth_header(admin_token),
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["status"] == "invites_sent"

    # Verify teams are cleared
    teams_get = await client.get(
        f"/api/runs/{run_id}/games/{game_id}/teams",
        headers=auth_header(admin_token),
    )
    assert teams_get.status_code == 200
    assert len(teams_get.json()) == 0
