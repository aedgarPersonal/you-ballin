"""Tests for notification system."""
import pytest
from tests.conftest import create_user, auth_header


@pytest.mark.asyncio
async def test_list_notifications(client):
    _, token = await create_user(client, make_admin=False)
    resp = await client.get("/api/notifications", headers=auth_header(token))
    assert resp.status_code == 200
    data = resp.json()
    assert "notifications" in data
    assert "unread_count" in data


@pytest.mark.asyncio
async def test_vapid_key(client):
    resp = await client.get("/api/push/vapid-key")
    assert resp.status_code == 200
    assert "public_key" in resp.json()
