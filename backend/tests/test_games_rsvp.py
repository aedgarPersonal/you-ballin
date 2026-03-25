"""Tests for Game CRUD and RSVP functionality."""
import pytest
from tests.conftest import create_user, create_run, create_game, auth_header


async def _make_player(client, run_id, admin_token, name="Player1", email="p1@test.com"):
    """Import a player and return their token."""
    await client.post(
        f"/api/runs/{run_id}/admin/import-players",
        json={"players": [{"name": name, "email": email}]},
        headers=auth_header(admin_token),
    )
    resp = await client.post("/api/auth/login", json={"email": email, "password": "Password123"})
    return resp.json()["access_token"]


@pytest.mark.asyncio
async def test_create_game(client):
    _, token = await create_user(client)
    run = await create_run(client, token)
    game = await create_game(client, token, run["id"])
    assert game["title"] == "Test Game"
    assert game["status"] == "scheduled"
    assert game["roster_size"] == 16


@pytest.mark.asyncio
async def test_list_games(client):
    _, token = await create_user(client)
    run = await create_run(client, token)
    await create_game(client, token, run["id"], "Game 1")
    await create_game(client, token, run["id"], "Game 2")
    resp = await client.get(f"/api/runs/{run['id']}/games", headers=auth_header(token))
    assert resp.status_code == 200
    assert len(resp.json()) >= 2


@pytest.mark.asyncio
async def test_get_game(client):
    _, token = await create_user(client)
    run = await create_run(client, token)
    game = await create_game(client, token, run["id"])
    resp = await client.get(f"/api/runs/{run['id']}/games/{game['id']}", headers=auth_header(token))
    assert resp.status_code == 200
    assert resp.json()["title"] == "Test Game"


@pytest.mark.asyncio
async def test_rsvp_accept(client):
    _, admin_token = await create_user(client)
    run = await create_run(client, admin_token)
    game = await create_game(client, admin_token, run["id"])
    player_token = await _make_player(client, run["id"], admin_token)
    resp = await client.post(
        f"/api/runs/{run['id']}/games/{game['id']}/rsvp",
        json={"status": "accepted"},
        headers=auth_header(player_token),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "accepted"


@pytest.mark.asyncio
async def test_rsvp_decline(client):
    _, admin_token = await create_user(client)
    run = await create_run(client, admin_token)
    game = await create_game(client, admin_token, run["id"])
    player_token = await _make_player(client, run["id"], admin_token)
    resp = await client.post(
        f"/api/runs/{run['id']}/games/{game['id']}/rsvp",
        json={"status": "declined"},
        headers=auth_header(player_token),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "declined"


@pytest.mark.asyncio
async def test_rsvp_update(client):
    """Player should be able to change their RSVP at any time before tipoff."""
    _, admin_token = await create_user(client)
    run = await create_run(client, admin_token)
    game = await create_game(client, admin_token, run["id"])
    player_token = await _make_player(client, run["id"], admin_token)
    url = f"/api/runs/{run['id']}/games/{game['id']}/rsvp"
    hdrs = auth_header(player_token)

    # Accept
    resp = await client.post(url, json={"status": "accepted"}, headers=hdrs)
    assert resp.json()["status"] == "accepted"

    # Change to declined
    resp = await client.post(url, json={"status": "declined"}, headers=hdrs)
    assert resp.json()["status"] == "declined"

    # Change back to accepted
    resp = await client.post(url, json={"status": "accepted"}, headers=hdrs)
    assert resp.json()["status"] == "accepted"


@pytest.mark.asyncio
async def test_get_rsvps(client):
    _, admin_token = await create_user(client)
    run = await create_run(client, admin_token)
    game = await create_game(client, admin_token, run["id"])
    player_token = await _make_player(client, run["id"], admin_token)
    await client.post(
        f"/api/runs/{run['id']}/games/{game['id']}/rsvp",
        json={"status": "accepted"},
        headers=auth_header(player_token),
    )
    resp = await client.get(
        f"/api/runs/{run['id']}/games/{game['id']}/rsvps",
        headers=auth_header(admin_token),
    )
    assert resp.status_code == 200
    rsvps = resp.json()
    assert len(rsvps) >= 1
    assert rsvps[0]["status"] == "accepted"
