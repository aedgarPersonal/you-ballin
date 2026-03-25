"""Tests for Run CRUD operations."""
import pytest
from tests.conftest import create_user, create_run, auth_header


@pytest.mark.asyncio
async def test_create_run(client):
    _, token = await create_user(client)
    run = await create_run(client, token)
    assert run["name"] == "Test Run"
    assert run["default_location"] == "Test Gym"


@pytest.mark.asyncio
async def test_list_runs(client):
    _, token = await create_user(client)
    await create_run(client, token, "Run A")
    await create_run(client, token, "Run B")
    resp = await client.get("/api/runs", headers=auth_header(token))
    assert resp.status_code == 200
    runs = resp.json()
    assert len(runs) >= 2


@pytest.mark.asyncio
async def test_get_run(client):
    _, token = await create_user(client)
    run = await create_run(client, token)
    resp = await client.get(f"/api/runs/{run['id']}", headers=auth_header(token))
    assert resp.status_code == 200
    assert resp.json()["name"] == "Test Run"


@pytest.mark.asyncio
async def test_create_run_no_auth(client):
    resp = await client.post("/api/runs", json={"name": "Fail"})
    assert resp.status_code in (401, 403, 422)
