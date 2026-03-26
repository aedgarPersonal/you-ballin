"""Tests for drop-in management: waitlist, promotion, priority modes."""
import pytest
from tests.conftest import create_user, create_run, create_game, auth_header


async def _import_dropin(client, run_id, admin_token, name, email):
    """Import a player, set them as drop-in, return their token."""
    await client.post(
        f"/api/runs/{run_id}/admin/import-players",
        json={"players": [{"name": name, "email": email}]},
        headers=auth_header(admin_token),
    )
    # Get user ID
    plist = await client.get(f"/api/runs/{run_id}/players", headers=auth_header(admin_token))
    user = next(u for u in plist.json()["users"] if u["email"] == email)

    # Change to drop-in
    await client.patch(
        f"/api/runs/{run_id}/admin/players/{user['id']}",
        json={"player_status": "dropin"},
        headers=auth_header(admin_token),
    )

    login_resp = await client.post("/api/auth/login", json={"email": email, "password": "Password123"})
    return login_resp.json()["access_token"], user["id"]


@pytest.mark.asyncio
async def test_dropin_before_open_goes_to_waitlist(client):
    """Drop-in RSVPing before DROPIN_OPEN should be waitlisted."""
    _, admin_token = await create_user(client)
    run = await create_run(client, admin_token)
    game = await create_game(client, admin_token, run["id"])

    # Change game to invites_sent
    await client.patch(
        f"/api/runs/{run['id']}/games/{game['id']}",
        json={"status": "invites_sent"},
        headers=auth_header(admin_token),
    )

    # Create drop-in player
    dropin_token, _ = await _import_dropin(client, run["id"], admin_token, "DropGuy", "drop@test.com")

    # RSVP as accepted — should be placed on waitlist (not DROPIN_OPEN yet)
    resp = await client.post(
        f"/api/runs/{run['id']}/games/{game['id']}/rsvp",
        json={"status": "accepted"},
        headers=auth_header(dropin_token),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "waitlist"


@pytest.mark.asyncio
async def test_dropin_during_open_gets_accepted(client):
    """Drop-in RSVPing during DROPIN_OPEN with spots available should be accepted."""
    _, admin_token = await create_user(client)
    run = await create_run(client, admin_token)
    game = await create_game(client, admin_token, run["id"])

    # Change game to dropin_open
    await client.patch(
        f"/api/runs/{run['id']}/games/{game['id']}",
        json={"status": "dropin_open"},
        headers=auth_header(admin_token),
    )

    dropin_token, _ = await _import_dropin(client, run["id"], admin_token, "DropGuy", "drop@test.com")

    resp = await client.post(
        f"/api/runs/{run['id']}/games/{game['id']}/rsvp",
        json={"status": "accepted"},
        headers=auth_header(dropin_token),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "accepted"


@pytest.mark.asyncio
async def test_decline_promotes_waitlisted(client):
    """When a regular declines, next waitlisted drop-in should be promoted."""
    _, admin_token = await create_user(client)
    run = await create_run(client, admin_token)

    # Create game with tiny roster so it fills easily
    resp = await client.post(f"/api/runs/{run['id']}/games", json={
        "title": "Small Game", "game_date": "2026-04-01T20:00:00",
        "location": "Gym", "roster_size": 2,
    }, headers=auth_header(admin_token))
    game = resp.json()

    # Change to invites_sent
    await client.patch(
        f"/api/runs/{run['id']}/games/{game['id']}",
        json={"status": "invites_sent"},
        headers=auth_header(admin_token),
    )

    # Import 2 regular players, fill the game
    for i in range(2):
        await client.post(
            f"/api/runs/{run['id']}/admin/import-players",
            json={"players": [{"name": f"Reg{i}", "email": f"reg{i}@test.com"}]},
            headers=auth_header(admin_token),
        )
    reg_tokens = []
    for i in range(2):
        lr = await client.post("/api/auth/login", json={"email": f"reg{i}@test.com", "password": "Password123"})
        reg_tokens.append(lr.json()["access_token"])

    # Both regulars accept
    for rt in reg_tokens:
        await client.post(
            f"/api/runs/{run['id']}/games/{game['id']}/rsvp",
            json={"status": "accepted"},
            headers=auth_header(rt),
        )

    # Change to dropin_open
    await client.patch(
        f"/api/runs/{run['id']}/games/{game['id']}",
        json={"status": "dropin_open"},
        headers=auth_header(admin_token),
    )

    # Drop-in tries to join — game is full, should be waitlisted
    dropin_token, dropin_id = await _import_dropin(client, run["id"], admin_token, "WaitGuy", "wait@test.com")
    dr = await client.post(
        f"/api/runs/{run['id']}/games/{game['id']}/rsvp",
        json={"status": "accepted"},
        headers=auth_header(dropin_token),
    )
    assert dr.json()["status"] == "waitlist"

    # Regular 0 declines — should auto-promote the waitlisted drop-in
    await client.post(
        f"/api/runs/{run['id']}/games/{game['id']}/rsvp",
        json={"status": "declined"},
        headers=auth_header(reg_tokens[0]),
    )

    # Check drop-in's RSVP — should now be accepted
    rsvps = await client.get(
        f"/api/runs/{run['id']}/games/{game['id']}/rsvps",
        headers=auth_header(admin_token),
    )
    dropin_rsvp = next(r for r in rsvps.json() if r["user_id"] == dropin_id)
    assert dropin_rsvp["status"] == "accepted"
