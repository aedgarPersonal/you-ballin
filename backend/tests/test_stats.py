"""Tests for stats endpoints."""
import pytest
from tests.conftest import create_user, create_run, auth_header


@pytest.mark.asyncio
async def test_get_run_stats(client):
    _, token = await create_user(client)
    run = await create_run(client, token)
    resp = await client.get(f"/api/runs/{run['id']}/stats", headers=auth_header(token))
    assert resp.status_code == 200
    data = resp.json()
    assert "overview" in data
    assert "leaderboards" in data
    assert "recent_games" in data


@pytest.mark.asyncio
async def test_matchups_empty(client):
    """Matchups should return empty when no games played."""
    user, token = await create_user(client)
    run = await create_run(client, token)
    resp = await client.get(f"/api/runs/{run['id']}/stats/my-matchups", headers=auth_header(token))
    assert resp.status_code == 200
    data = resp.json()
    assert data["best_teammates"] == []
    assert data["toughest_opponents"] == []
