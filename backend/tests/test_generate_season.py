"""Tests for season game generation: POST /runs/{id}/games/generate-season."""
import pytest
from tests.conftest import create_user, create_run, create_game, auth_header


async def _setup_run_with_dates(client, token, run_id):
    """Update a run with season dates and schedule settings."""
    resp = await client.patch(
        f"/api/runs/{run_id}",
        json={
            "start_date": "2026-04-06",
            "end_date": "2026-06-29",
            "default_game_day": 0,       # Monday
            "default_game_time": "20:00",
        },
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    return resp.json()


@pytest.mark.asyncio
async def test_generate_season_games(client):
    """POST /runs/{id}/games/generate-season creates games for each week."""
    _, token = await create_user(client)
    run = await create_run(client, token)
    await _setup_run_with_dates(client, token, run["id"])

    resp = await client.post(
        f"/api/runs/{run['id']}/games/generate-season",
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["games_created"] > 0
    assert len(data["dates"]) == data["games_created"]

    # Verify games were actually created
    games_resp = await client.get(
        f"/api/runs/{run['id']}/games",
        headers=auth_header(token),
    )
    assert games_resp.status_code == 200
    assert len(games_resp.json()) >= data["games_created"]


@pytest.mark.asyncio
async def test_generate_season_skips_existing(client):
    """Creating a game on a date, then generating season should skip that date."""
    _, token = await create_user(client)
    run = await create_run(client, token)
    await _setup_run_with_dates(client, token, run["id"])

    # Create a game on one of the Mondays in the season range
    await client.post(
        f"/api/runs/{run['id']}/games",
        json={
            "title": "Pre-existing Game",
            "game_date": "2026-04-06T20:00:00",
            "location": "Test Gym",
        },
        headers=auth_header(token),
    )

    # Generate season
    resp = await client.post(
        f"/api/runs/{run['id']}/games/generate-season",
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    data = resp.json()

    # The pre-existing date (2026-04-06) should have been skipped
    assert "2026-04-06" not in data["dates"]

    # Generate again should create 0 new games (all dates already covered)
    resp2 = await client.post(
        f"/api/runs/{run['id']}/games/generate-season",
        headers=auth_header(token),
    )
    assert resp2.status_code == 200
    assert resp2.json()["games_created"] == 0


@pytest.mark.asyncio
async def test_generate_season_requires_dates(client):
    """Attempting to generate season without start/end dates should fail."""
    _, token = await create_user(client)
    run = await create_run(client, token)

    # Don't set start_date / end_date, just try to generate
    resp = await client.post(
        f"/api/runs/{run['id']}/games/generate-season",
        headers=auth_header(token),
    )
    assert resp.status_code == 400
    assert "missing" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_generated_games_have_correct_status(client):
    """All generated games should have status 'scheduled'."""
    _, token = await create_user(client)
    run = await create_run(client, token)
    await _setup_run_with_dates(client, token, run["id"])

    resp = await client.post(
        f"/api/runs/{run['id']}/games/generate-season",
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    assert resp.json()["games_created"] > 0

    # Fetch all games and verify status
    games_resp = await client.get(
        f"/api/runs/{run['id']}/games",
        headers=auth_header(token),
    )
    assert games_resp.status_code == 200
    games = games_resp.json()
    for game in games:
        assert game["status"] == "scheduled"
