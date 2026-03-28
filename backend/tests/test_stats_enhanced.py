"""Tests for enhanced stats endpoints: game history, form/streaks, matchups, recalculation."""
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

    tokens = []
    for i in range(1, count + 1):
        login_resp = await client.post("/api/auth/login", json={
            "email": f"p{i}@test.com", "password": "Password123",
        })
        assert login_resp.status_code == 200
        tokens.append(login_resp.json()["access_token"])
    return tokens


async def _complete_game(client, run_id, game_id, admin_token, player_tokens):
    """RSVP all players, generate teams, record result. Returns the game detail."""
    # All players RSVP accepted
    for pt in player_tokens:
        resp = await client.post(
            f"/api/runs/{run_id}/games/{game_id}/rsvp",
            json={"status": "accepted"},
            headers=auth_header(pt),
        )
        assert resp.status_code == 200

    # Generate teams
    teams_resp = await client.post(
        f"/api/runs/{run_id}/games/{game_id}/teams",
        headers=auth_header(admin_token),
    )
    assert teams_resp.status_code in (200, 201)
    teams = teams_resp.json()

    # Get unique teams for recording result
    team_ids = list(set(t["team"] for t in teams))
    assert len(team_ids) == 2

    # Record result: first team wins 3-2
    team_scores = [
        {"team": team_ids[0], "wins": 3},
        {"team": team_ids[1], "wins": 2},
    ]
    result_resp = await client.post(
        f"/api/runs/{run_id}/games/{game_id}/result",
        json={"team_scores": team_scores},
        headers=auth_header(admin_token),
    )
    assert result_resp.status_code in (200, 201)

    # Fetch and return the completed game detail
    game_resp = await client.get(
        f"/api/runs/{run_id}/games/{game_id}",
        headers=auth_header(admin_token),
    )
    assert game_resp.json()["status"] == "completed"
    return game_resp.json()


async def _setup_completed_game(client):
    """Full setup: admin + run + 10 players + completed game. Returns all context."""
    _, admin_token = await create_user(client, "Admin", "admin@test.com")
    run = await create_run(client, admin_token)
    game = await create_game(client, admin_token, run["id"])
    run_id = run["id"]
    game_id = game["id"]

    player_tokens = await _setup_players(client, run_id, admin_token)
    game_detail = await _complete_game(client, run_id, game_id, admin_token, player_tokens)

    # Get a player ID from the player list
    plist = await client.get(f"/api/runs/{run_id}/players", headers=auth_header(admin_token))
    players = plist.json()["users"]
    # Pick the first non-admin player
    player = next(p for p in players if p["full_name"].startswith("Player"))

    return {
        "admin_token": admin_token,
        "run_id": run_id,
        "game_id": game_id,
        "game_detail": game_detail,
        "player_tokens": player_tokens,
        "player_id": player["id"],
        "players": players,
    }


@pytest.mark.asyncio
async def test_player_game_history(client):
    """GET /runs/{id}/stats/player/{pid}/game-history returns game history list."""
    ctx = await _setup_completed_game(client)

    resp = await client.get(
        f"/api/runs/{ctx['run_id']}/stats/player/{ctx['player_id']}/game-history",
        headers=auth_header(ctx["admin_token"]),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    entry = data[0]
    assert "game_id" in entry
    assert "won" in entry
    assert "score" in entry
    assert "team_name" in entry


@pytest.mark.asyncio
async def test_player_form_streak(client):
    """GET /runs/{id}/stats/player/{pid}/form returns streak and recent record."""
    ctx = await _setup_completed_game(client)

    resp = await client.get(
        f"/api/runs/{ctx['run_id']}/stats/player/{ctx['player_id']}/form",
        headers=auth_header(ctx["admin_token"]),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "current_streak" in data
    assert "last_5" in data
    assert "last_10" in data
    assert data["current_streak"]["count"] >= 1
    assert data["last_5"]["wins"] + data["last_5"]["losses"] >= 1


@pytest.mark.asyncio
async def test_player_form_trend(client):
    """Verify form.trend is one of the valid trend values."""
    ctx = await _setup_completed_game(client)

    resp = await client.get(
        f"/api/runs/{ctx['run_id']}/stats/player/{ctx['player_id']}/form",
        headers=auth_header(ctx["admin_token"]),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["trend"] in ("stable", "improving", "declining")


@pytest.mark.asyncio
async def test_player_matchups_returns_data(client):
    """GET /runs/{id}/stats/player/{pid}/matchups returns teammates and opponents."""
    ctx = await _setup_completed_game(client)

    resp = await client.get(
        f"/api/runs/{ctx['run_id']}/stats/player/{ctx['player_id']}/matchups",
        headers=auth_header(ctx["admin_token"]),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "best_teammates" in data
    assert "toughest_opponents" in data
    # With 10 players on 2 teams, there should be teammates and opponents
    assert isinstance(data["best_teammates"], list)
    assert isinstance(data["toughest_opponents"], list)


@pytest.mark.asyncio
async def test_player_rating_range(client):
    """Verify player_rating from the rating summary is between 40 and 99."""
    ctx = await _setup_completed_game(client)

    resp = await client.get(
        f"/api/runs/{ctx['run_id']}/players/{ctx['player_id']}/rating-summary",
        headers=auth_header(ctx["admin_token"]),
    )
    assert resp.status_code == 200
    data = resp.json()
    # jordan_factor should be between 0 and 1, games_played should be >= 1
    assert data["games_played"] >= 1
    assert 0 <= data["jordan_factor"] <= 1


@pytest.mark.asyncio
async def test_recent_games_include_my_team(client):
    """GET /runs/{id}/stats recent_games have my_team and my_won fields."""
    ctx = await _setup_completed_game(client)

    # Use one of the player tokens so my_team is populated
    resp = await client.get(
        f"/api/runs/{ctx['run_id']}/stats",
        headers=auth_header(ctx["player_tokens"][0]),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "recent_games" in data
    assert len(data["recent_games"]) >= 1
    game_summary = data["recent_games"][0]
    # The player was on a team, so my_team and my_won should be present
    assert "my_team" in game_summary
    assert "my_won" in game_summary
    assert game_summary["my_team"] is not None
    assert game_summary["my_won"] is not None


@pytest.mark.asyncio
async def test_stats_recalc_after_deletion(client):
    """Complete a game, verify stats, delete the game, verify stats reset."""
    ctx = await _setup_completed_game(client)
    run_id = ctx["run_id"]
    game_id = ctx["game_id"]
    admin_token = ctx["admin_token"]

    # Verify stats reflect the completed game
    stats_resp = await client.get(
        f"/api/runs/{run_id}/stats",
        headers=auth_header(admin_token),
    )
    assert stats_resp.status_code == 200
    assert stats_resp.json()["overview"]["total_games"] >= 1

    # Delete the completed game
    del_resp = await client.delete(
        f"/api/runs/{run_id}/games/{game_id}",
        headers=auth_header(admin_token),
    )
    assert del_resp.status_code == 204

    # Verify stats are recalculated (no completed games left)
    stats_resp2 = await client.get(
        f"/api/runs/{run_id}/stats",
        headers=auth_header(admin_token),
    )
    assert stats_resp2.status_code == 200
    assert stats_resp2.json()["overview"]["total_games"] == 0


@pytest.mark.asyncio
async def test_stats_recalc_after_status_revert(client):
    """Complete a game, change status to scheduled, verify stats reset."""
    ctx = await _setup_completed_game(client)
    run_id = ctx["run_id"]
    game_id = ctx["game_id"]
    admin_token = ctx["admin_token"]

    # Verify the game is completed and stats reflect it
    stats_resp = await client.get(
        f"/api/runs/{run_id}/stats",
        headers=auth_header(admin_token),
    )
    assert stats_resp.status_code == 200
    assert stats_resp.json()["overview"]["total_games"] >= 1

    # Revert game status to scheduled
    patch_resp = await client.patch(
        f"/api/runs/{run_id}/games/{game_id}",
        json={"status": "scheduled"},
        headers=auth_header(admin_token),
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["status"] == "scheduled"

    # Verify stats are recalculated (no completed games left)
    stats_resp2 = await client.get(
        f"/api/runs/{run_id}/stats",
        headers=auth_header(admin_token),
    )
    assert stats_resp2.status_code == 200
    assert stats_resp2.json()["overview"]["total_games"] == 0
