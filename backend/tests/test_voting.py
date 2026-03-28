"""Tests for game award voting: MVP, Shaqtin', and X Factor."""
import pytest
from tests.conftest import create_user, create_run, create_game, auth_header


async def _setup_completed_game(client):
    """Create admin, run, game with 10 players, RSVP all, generate teams, record result.

    Returns (run_id, game_id, admin_token, player_tokens, player_ids).
    """
    _, admin_token = await create_user(client, "Admin", "admin@test.com")
    run = await create_run(client, admin_token)
    game = await create_game(client, admin_token, run["id"])
    run_id = run["id"]
    game_id = game["id"]

    # Import 10 players
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

    # Login each player and collect tokens + ids
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
    assert len(teams) == 10

    # Record result
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
async def test_cast_mvp_vote(client):
    """POST /runs/{id}/games/{gid}/votes with vote_type=mvp succeeds."""
    run_id, game_id, _, player_tokens, player_ids = await _setup_completed_game(client)

    resp = await client.post(
        f"/api/runs/{run_id}/games/{game_id}/votes",
        json={"vote_type": "mvp", "nominee_id": player_ids[1]},
        headers=auth_header(player_tokens[0]),
    )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_cast_shaqtin_vote(client):
    """POST /runs/{id}/games/{gid}/votes with vote_type=shaqtin succeeds."""
    run_id, game_id, _, player_tokens, player_ids = await _setup_completed_game(client)

    resp = await client.post(
        f"/api/runs/{run_id}/games/{game_id}/votes",
        json={"vote_type": "shaqtin", "nominee_id": player_ids[2]},
        headers=auth_header(player_tokens[0]),
    )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_cast_xfactor_vote(client):
    """POST /runs/{id}/games/{gid}/votes with vote_type=xfactor succeeds."""
    run_id, game_id, _, player_tokens, player_ids = await _setup_completed_game(client)

    resp = await client.post(
        f"/api/runs/{run_id}/games/{game_id}/votes",
        json={"vote_type": "xfactor", "nominee_id": player_ids[3]},
        headers=auth_header(player_tokens[0]),
    )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_change_vote(client):
    """Casting a vote again for a different player updates the existing vote."""
    run_id, game_id, _, player_tokens, player_ids = await _setup_completed_game(client)

    # Cast initial vote
    resp1 = await client.post(
        f"/api/runs/{run_id}/games/{game_id}/votes",
        json={"vote_type": "mvp", "nominee_id": player_ids[1]},
        headers=auth_header(player_tokens[0]),
    )
    assert resp1.status_code == 201

    # Change vote to a different player
    resp2 = await client.post(
        f"/api/runs/{run_id}/games/{game_id}/votes",
        json={"vote_type": "mvp", "nominee_id": player_ids[2]},
        headers=auth_header(player_tokens[0]),
    )
    # Should succeed (upsert) - may return 201 since the route always returns 201
    assert resp2.status_code == 201

    # Verify the vote was updated by checking "my votes"
    my_votes_resp = await client.get(
        f"/api/runs/{run_id}/games/{game_id}/votes/mine",
        headers=auth_header(player_tokens[0]),
    )
    assert my_votes_resp.status_code == 200
    data = my_votes_resp.json()
    assert data["mvp_vote"]["nominee_id"] == player_ids[2]


@pytest.mark.asyncio
async def test_cannot_vote_for_self(client):
    """Trying to vote for yourself should fail with 400."""
    run_id, game_id, _, player_tokens, player_ids = await _setup_completed_game(client)

    resp = await client.post(
        f"/api/runs/{run_id}/games/{game_id}/votes",
        json={"vote_type": "mvp", "nominee_id": player_ids[0]},
        headers=auth_header(player_tokens[0]),
    )
    assert resp.status_code == 400
    assert "yourself" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_get_awards(client):
    """GET /runs/{id}/games/{gid}/awards returns awards data."""
    run_id, game_id, admin_token, _, _ = await _setup_completed_game(client)

    resp = await client.get(
        f"/api/runs/{run_id}/games/{game_id}/awards",
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "game_id" in data
    assert "voting_open" in data
    assert "total_voters" in data
    assert data["game_id"] == game_id
