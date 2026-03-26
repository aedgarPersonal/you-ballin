"""Tests for invite code system: create, validate, register with code."""
import pytest
from tests.conftest import create_user, create_run, auth_header


@pytest.mark.asyncio
async def test_generate_invite_code(client):
    _, token = await create_user(client)
    run = await create_run(client, token)
    resp = await client.post(
        f"/api/runs/{run['id']}/admin/invite-codes",
        json={},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["code"]) == 8
    assert data["is_active"] is True
    assert data["use_count"] == 0


@pytest.mark.asyncio
async def test_list_invite_codes(client):
    _, token = await create_user(client)
    run = await create_run(client, token)
    # Generate 2 codes
    await client.post(f"/api/runs/{run['id']}/admin/invite-codes", json={}, headers=auth_header(token))
    await client.post(f"/api/runs/{run['id']}/admin/invite-codes", json={}, headers=auth_header(token))
    resp = await client.get(f"/api/runs/{run['id']}/admin/invite-codes", headers=auth_header(token))
    assert resp.status_code == 200
    assert len(resp.json()) >= 2


@pytest.mark.asyncio
async def test_validate_code_public(client):
    _, token = await create_user(client)
    run = await create_run(client, token)
    # Generate code
    code_resp = await client.post(
        f"/api/runs/{run['id']}/admin/invite-codes", json={}, headers=auth_header(token)
    )
    code = code_resp.json()["code"]

    # Validate without auth
    resp = await client.get(f"/api/auth/validate-code?code={code}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["valid"] is True
    assert data["run_name"] == run["name"]


@pytest.mark.asyncio
async def test_validate_invalid_code(client):
    resp = await client.get("/api/auth/validate-code?code=DOESNOTEXIST")
    assert resp.status_code == 200
    assert resp.json()["valid"] is False


@pytest.mark.asyncio
async def test_register_with_invite_code(client):
    _, token = await create_user(client)
    run = await create_run(client, token)
    code_resp = await client.post(
        f"/api/runs/{run['id']}/admin/invite-codes", json={}, headers=auth_header(token)
    )
    code = code_resp.json()["code"]

    # Register new user with the code
    resp = await client.post("/api/auth/register", json={
        "full_name": "Invited User",
        "email": "invited@test.com",
        "username": "invited",
        "password": "Password123",
        "invite_code": code,
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["user"]["full_name"] == "Invited User"

    # Verify use_count incremented
    codes_resp = await client.get(
        f"/api/runs/{run['id']}/admin/invite-codes", headers=auth_header(token)
    )
    updated = next(c for c in codes_resp.json() if c["code"] == code)
    assert updated["use_count"] == 1


@pytest.mark.asyncio
async def test_register_with_maxed_code(client):
    _, token = await create_user(client)
    run = await create_run(client, token)
    code_resp = await client.post(
        f"/api/runs/{run['id']}/admin/invite-codes",
        json={"max_uses": 1},
        headers=auth_header(token),
    )
    code = code_resp.json()["code"]

    # First registration succeeds
    resp1 = await client.post("/api/auth/register", json={
        "full_name": "First", "email": "first@test.com",
        "username": "first", "password": "Password123",
        "invite_code": code,
    })
    assert resp1.status_code == 201

    # Second registration fails (max uses reached)
    resp2 = await client.post("/api/auth/register", json={
        "full_name": "Second", "email": "second@test.com",
        "username": "second", "password": "Password123",
        "invite_code": code,
    })
    assert resp2.status_code == 400
    assert "usage limit" in resp2.json()["detail"].lower()


@pytest.mark.asyncio
async def test_deactivate_code(client):
    _, token = await create_user(client)
    run = await create_run(client, token)
    code_resp = await client.post(
        f"/api/runs/{run['id']}/admin/invite-codes", json={}, headers=auth_header(token)
    )
    code_id = code_resp.json()["id"]
    code = code_resp.json()["code"]

    # Deactivate
    resp = await client.patch(
        f"/api/runs/{run['id']}/admin/invite-codes/{code_id}",
        json={"is_active": False},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False

    # Registration with deactivated code fails
    resp = await client.post("/api/auth/register", json={
        "full_name": "Blocked", "email": "blocked@test.com",
        "username": "blocked", "password": "Password123",
        "invite_code": code,
    })
    assert resp.status_code == 400
