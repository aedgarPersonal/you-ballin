"""Tests for full game lifecycle: create → RSVP → teams → result → vote."""
import pytest
from tests.conftest import create_user, create_run, create_game, auth_header


async def _setup_players(client, run_id, token, count=10):
    """Import `count` players and return their tokens."""
    players = [
        {"name": f"Player {i}", "email": f"p{i}@test.com", "wins": i, "losses": count - i}
        for i in range(1, count + 1)
    ]
    resp = await client.post(
        f"/api/runs/{run_id}/admin/import-players",
        json={"players": players},
        headers=auth_header(token),
    )
    assert resp.json()["created_count"] == count

    # Login each player and return tokens
    tokens = []
    for i in range(1, count + 1):
        login_resp = await client.post("/api/auth/login", json={
            "email": f"p{i}@test.com", "password": "Password123",
        })
        assert login_resp.status_code == 200
        tokens.append(login_resp.json()["access_token"])
    return tokens


@pytest.mark.asyncio
async def test_full_game_lifecycle(client):
    """Test: create game → players RSVP → generate teams → record result."""
    # Setup: admin + run + game
    _, admin_token = await create_user(client, "Admin", "admin@test.com")
    run = await create_run(client, admin_token)
    game = await create_game(client, admin_token, run["id"])
    run_id = run["id"]
    game_id = game["id"]

    # Import 10 players
    player_tokens = await _setup_players(client, run_id, admin_token)

    # All players RSVP accepted
    for pt in player_tokens:
        resp = await client.post(
            f"/api/runs/{run_id}/games/{game_id}/rsvp",
            json={"status": "accepted"},
            headers=auth_header(pt),
        )
        assert resp.status_code == 200

    # Verify accepted count
    game_resp = await client.get(
        f"/api/runs/{run_id}/games/{game_id}",
        headers=auth_header(admin_token),
    )
    assert game_resp.json()["accepted_count"] == 10

    # Generate teams
    teams_resp = await client.post(
        f"/api/runs/{run_id}/games/{game_id}/teams",
        headers=auth_header(admin_token),
    )
    assert teams_resp.status_code in (200, 201), f"Generate teams failed: {teams_resp.text}"
    teams = teams_resp.json()
    assert len(teams) == 10  # 10 team assignments

    # Verify game status changed
    game_resp = await client.get(
        f"/api/runs/{run_id}/games/{game_id}",
        headers=auth_header(admin_token),
    )
    assert game_resp.json()["status"] == "teams_set"

    # Get unique teams for recording result
    team_ids = set(t["team"] for t in teams)
    assert len(team_ids) == 2

    # Record result
    team_scores = [{"team": tid, "wins": 3 - i} for i, tid in enumerate(team_ids)]
    result_resp = await client.post(
        f"/api/runs/{run_id}/games/{game_id}/result",
        json={"team_scores": team_scores},
        headers=auth_header(admin_token),
    )
    assert result_resp.status_code in (200, 201), f"Record result failed: {result_resp.text}"

    # Verify game is completed
    game_resp = await client.get(
        f"/api/runs/{run_id}/games/{game_id}",
        headers=auth_header(admin_token),
    )
    assert game_resp.json()["status"] == "completed"


@pytest.mark.asyncio
async def test_cancel_game(client):
    _, token = await create_user(client)
    run = await create_run(client, token)
    game = await create_game(client, token, run["id"])
    resp = await client.post(
        f"/api/runs/{run['id']}/games/{game['id']}/cancel",
        headers=auth_header(token),
    )
    assert resp.status_code == 200

    # Verify cancelled
    game_resp = await client.get(
        f"/api/runs/{run['id']}/games/{game['id']}",
        headers=auth_header(token),
    )
    assert game_resp.json()["status"] == "cancelled"


@pytest.mark.asyncio
async def test_rsvp_update_before_tipoff(client):
    """Player should be able to change RSVP any time before teams are set."""
    _, admin_token = await create_user(client, "Admin", "admin@test.com")
    run = await create_run(client, admin_token)
    game = await create_game(client, admin_token, run["id"])

    # Import a player
    await client.post(
        f"/api/runs/{run['id']}/admin/import-players",
        json={"players": [{"name": "Flipper", "email": "flip@test.com"}]},
        headers=auth_header(admin_token),
    )
    flip_resp = await client.post("/api/auth/login", json={
        "email": "flip@test.com", "password": "Password123",
    })
    flip_token = flip_resp.json()["access_token"]

    url = f"/api/runs/{run['id']}/games/{game['id']}/rsvp"
    hdrs = auth_header(flip_token)

    # Accept → Decline → Accept
    r1 = await client.post(url, json={"status": "accepted"}, headers=hdrs)
    assert r1.json()["status"] == "accepted"

    r2 = await client.post(url, json={"status": "declined"}, headers=hdrs)
    assert r2.json()["status"] == "declined"

    r3 = await client.post(url, json={"status": "accepted"}, headers=hdrs)
    assert r3.json()["status"] == "accepted"
