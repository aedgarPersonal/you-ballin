"""Tests for player management: listing, import, admin updates."""
import pytest
from tests.conftest import create_user, create_run, auth_header


@pytest.mark.asyncio
async def test_list_players(client):
    _, token = await create_user(client)
    run = await create_run(client, token)
    resp = await client.get(f"/api/runs/{run['id']}/players", headers=auth_header(token))
    assert resp.status_code == 200
    data = resp.json()
    assert "users" in data


@pytest.mark.asyncio
async def test_import_players(client):
    _, token = await create_user(client)
    run = await create_run(client, token)
    resp = await client.post(
        f"/api/runs/{run['id']}/admin/import-players",
        json={"players": [
            {"name": "Bryan", "email": "bryan@test.com", "wins": 26, "losses": 14},
            {"name": "Julien", "email": "julien@test.com", "wins": 23, "losses": 12},
        ]},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["created_count"] == 2
    assert len(data["created_players"]) == 2


@pytest.mark.asyncio
async def test_import_duplicate_email(client):
    _, token = await create_user(client)
    run = await create_run(client, token)
    players = [{"name": "Same", "email": "same@test.com"}]
    # First import
    resp = await client.post(
        f"/api/runs/{run['id']}/admin/import-players",
        json={"players": players},
        headers=auth_header(token),
    )
    assert resp.json()["created_count"] == 1

    # Second import with same email — should be skipped
    resp = await client.post(
        f"/api/runs/{run['id']}/admin/import-players",
        json={"players": players},
        headers=auth_header(token),
    )
    assert resp.json()["created_count"] == 0
    assert resp.json()["skipped_count"] == 1


@pytest.mark.asyncio
async def test_import_with_extended_fields(client):
    _, token = await create_user(client)
    run = await create_run(client, token)
    resp = await client.post(
        f"/api/runs/{run['id']}/admin/import-players",
        json={"players": [{
            "name": "BigMan", "email": "big@test.com",
            "wins": 10, "losses": 5,
            "height_inches": 78, "age": 25, "mobility": 4.0,
            "avg_offense": 4.5, "avg_defense": 3.5, "avg_overall": 4.0,
        }]},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    assert resp.json()["created_count"] == 1

    # Verify the imported player has the right fields
    plist = await client.get(f"/api/runs/{run['id']}/players", headers=auth_header(token))
    users = plist.json()["users"]
    big = next((u for u in users if u["full_name"] == "BigMan"), None)
    assert big is not None
    assert big["height_inches"] == 78
    assert big["age"] == 25


@pytest.mark.asyncio
async def test_import_missing_email(client):
    _, token = await create_user(client)
    run = await create_run(client, token)
    resp = await client.post(
        f"/api/runs/{run['id']}/admin/import-players",
        json={"players": [{"name": "NoEmail"}]},
        headers=auth_header(token),
    )
    assert resp.status_code == 422  # Validation error — email required


@pytest.mark.asyncio
async def test_quick_add_player(client):
    _, token = await create_user(client)
    run = await create_run(client, token)
    resp = await client.post(
        f"/api/runs/{run['id']}/admin/add-player",
        json={"full_name": "Quick Add", "email": "quick@test.com"},
        headers=auth_header(token),
    )
    assert resp.status_code in (200, 201)
    assert resp.json()["full_name"] == "Quick Add"
