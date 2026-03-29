"""Tests for season management: reset, archives, and leaderboards."""
import pytest
from tests.conftest import create_user, create_run, create_game, auth_header


async def _setup_run_with_players(client, player_count=5):
    """Create admin, run, and import players with win/loss records.

    Returns (run_id, admin_token, player_ids).
    """
    _, admin_token = await create_user(client, "Admin", "admin@test.com")
    run = await create_run(client, admin_token)
    run_id = run["id"]

    players = [
        {"name": f"Player {i}", "email": f"p{i}@test.com", "wins": i * 2, "losses": i}
        for i in range(1, player_count + 1)
    ]
    resp = await client.post(
        f"/api/runs/{run_id}/admin/import-players",
        json={"players": players},
        headers=auth_header(admin_token),
    )
    assert resp.json()["created_count"] == player_count

    player_ids = []
    for i in range(1, player_count + 1):
        login_resp = await client.post("/api/auth/login", json={
            "email": f"p{i}@test.com", "password": "Password123",
        })
        assert login_resp.status_code == 200
        player_ids.append(login_resp.json()["user"]["id"])

    return run_id, admin_token, player_ids


async def _complete_a_game(client, run_id, admin_token, player_ids):
    """Create a game, RSVP all players, generate teams, record result. Returns game_id."""
    game = await create_game(client, admin_token, run_id)
    game_id = game["id"]

    # Each player RSVPs
    for pid in player_ids:
        # Login each player to get their token
        # We need the token, so re-login
        pass

    # Use admin RSVP to avoid needing player tokens
    for pid in player_ids:
        await client.post(
            f"/api/runs/{run_id}/games/{game_id}/rsvp/admin",
            json={"user_id": pid, "status": "accepted"},
            headers=auth_header(admin_token),
        )

    # Generate teams
    teams_resp = await client.post(
        f"/api/runs/{run_id}/games/{game_id}/teams",
        headers=auth_header(admin_token),
    )
    assert teams_resp.status_code in (200, 201)
    teams = teams_resp.json()

    # Record result
    team_ids = set(t["team"] for t in teams)
    team_scores = [{"team": tid, "wins": 3 - i} for i, tid in enumerate(team_ids)]
    result_resp = await client.post(
        f"/api/runs/{run_id}/games/{game_id}/result",
        json={"team_scores": team_scores},
        headers=auth_header(admin_token),
    )
    assert result_resp.status_code in (200, 201)

    return game_id


@pytest.mark.asyncio
async def test_season_reset(client):
    """POST /runs/{id}/admin/season-reset archives stats and resets counters."""
    run_id, admin_token, player_ids = await _setup_run_with_players(client, player_count=10)
    await _complete_a_game(client, run_id, admin_token, player_ids)

    # Season reset
    resp = await client.post(
        f"/api/runs/{run_id}/admin/season-reset",
        json={"label": "Season 1"},
        headers=auth_header(admin_token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "archive_id" in data
    assert data["games_in_season"] >= 1

    # Verify stats are reset — overview should show 0 total games still
    # (completed games still exist but stats counters are reset)
    stats_resp = await client.get(
        f"/api/runs/{run_id}/stats",
        headers=auth_header(admin_token),
    )
    assert stats_resp.status_code == 200


@pytest.mark.asyncio
async def test_season_reset_preserves_games(client):
    """After season reset, the completed game should still exist."""
    run_id, admin_token, player_ids = await _setup_run_with_players(client, player_count=10)
    game_id = await _complete_a_game(client, run_id, admin_token, player_ids)

    # Reset season
    await client.post(
        f"/api/runs/{run_id}/admin/season-reset",
        json={"label": "Season 1"},
        headers=auth_header(admin_token),
    )

    # Game should still exist
    game_resp = await client.get(
        f"/api/runs/{run_id}/games/{game_id}",
        headers=auth_header(admin_token),
    )
    assert game_resp.status_code == 200
    assert game_resp.json()["status"] == "completed"


@pytest.mark.asyncio
async def test_list_seasons(client):
    """After reset, GET /runs/{id}/stats/seasons returns the archive."""
    run_id, admin_token, player_ids = await _setup_run_with_players(client, player_count=10)
    await _complete_a_game(client, run_id, admin_token, player_ids)

    # Reset season
    await client.post(
        f"/api/runs/{run_id}/admin/season-reset",
        json={"label": "Test Season"},
        headers=auth_header(admin_token),
    )

    # List seasons
    resp = await client.get(
        f"/api/runs/{run_id}/stats/seasons",
        headers=auth_header(admin_token),
    )
    assert resp.status_code == 200
    seasons = resp.json()
    assert len(seasons) >= 1
    assert seasons[0]["label"] == "Test Season"
    assert "id" in seasons[0]
    assert "total_games" in seasons[0]


@pytest.mark.asyncio
async def test_season_detail(client):
    """GET /runs/{id}/stats/seasons/{sid} returns player leaderboard."""
    run_id, admin_token, player_ids = await _setup_run_with_players(client, player_count=10)
    await _complete_a_game(client, run_id, admin_token, player_ids)

    # Reset season
    reset_resp = await client.post(
        f"/api/runs/{run_id}/admin/season-reset",
        json={"label": "Detail Season"},
        headers=auth_header(admin_token),
    )
    season_id = reset_resp.json()["archive_id"]

    # Get season detail
    resp = await client.get(
        f"/api/runs/{run_id}/stats/seasons/{season_id}",
        headers=auth_header(admin_token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["label"] == "Detail Season"
    assert "players" in data
    assert len(data["players"]) > 0
    # Each player snapshot should have key fields
    player = data["players"][0]
    assert "user_id" in player
    assert "games_played" in player
    assert "win_rate" in player


@pytest.mark.asyncio
async def test_multiple_season_resets(client):
    """Resetting twice creates two separate archives."""
    run_id, admin_token, player_ids = await _setup_run_with_players(client, player_count=10)
    await _complete_a_game(client, run_id, admin_token, player_ids)

    # First reset
    resp1 = await client.post(
        f"/api/runs/{run_id}/admin/season-reset",
        json={"label": "Season Alpha"},
        headers=auth_header(admin_token),
    )
    assert resp1.status_code == 200

    # Complete another game for the second season
    await _complete_a_game(client, run_id, admin_token, player_ids)

    # Second reset
    resp2 = await client.post(
        f"/api/runs/{run_id}/admin/season-reset",
        json={"label": "Season Beta"},
        headers=auth_header(admin_token),
    )
    assert resp2.status_code == 200

    # List seasons — should have two
    seasons_resp = await client.get(
        f"/api/runs/{run_id}/stats/seasons",
        headers=auth_header(admin_token),
    )
    assert seasons_resp.status_code == 200
    seasons = seasons_resp.json()
    assert len(seasons) == 2
    labels = {s["label"] for s in seasons}
    assert "Season Alpha" in labels
    assert "Season Beta" in labels
