"""
Game Action Routes (Token-Based, No Login Required)
=====================================================
Mobile-friendly endpoints for RSVP and voting via a signed JWT token.
Players receive a URL like /game/{token} which the frontend uses to
call these endpoints.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends
from sqlalchemy.orm import selectinload

from app.auth.jwt import verify_game_action_token
from app.database import get_db
from app.models.game import Game, GameStatus, RSVP, RSVPStatus
from app.models.team import TeamAssignment, GameResult
from app.models.user import User
from app.models.vote import GameVote, VoteType
from app.models.run import RunMembership
from app.models.notification import NotificationType
from app.schemas.user import UserResponse

router = APIRouter(prefix="/api/game-action", tags=["Game Actions (Token)"])


class GameActionResponse(BaseModel):
    """Everything the mobile page needs to render."""
    # Game info
    game_id: int
    run_id: int
    run_name: str
    title: str
    game_date: str
    location: str
    status: str
    roster_size: int
    accepted_count: int
    notes: str | None = None

    # Player info
    user_id: int
    user_name: str

    # RSVP state
    rsvp_status: str | None = None  # current RSVP status or None

    # Team info (if teams are set)
    teams: list[dict] | None = None  # [{team_name, players: [{id, name}]}]
    my_team: str | None = None

    # Voting info (if completed)
    voting_open: bool = False
    voting_deadline: str | None = None
    my_votes: dict | None = None  # {mvp: nominee_id, shaqtin: nominee_id, xfactor: nominee_id}
    participants: list[dict] | None = None  # [{id, name}] for voting

    # Awards (if voting closed)
    awards: dict | None = None  # {mvp: {name, votes}, shaqtin: {name, votes}, xfactor: {name, votes}}


class RSVPAction(BaseModel):
    status: str  # "accepted" or "declined"


class VoteAction(BaseModel):
    vote_type: str  # "mvp", "shaqtin", "xfactor"
    nominee_id: int


async def _get_token_context(token: str, db: AsyncSession):
    """Verify token and load game + user. Raises HTTPException on failure."""
    data = verify_game_action_token(token)
    if not data:
        raise HTTPException(status_code=401, detail="Invalid or expired link")

    game_result = await db.execute(
        select(Game).where(Game.id == data["game_id"])
        .options(
            selectinload(Game.rsvps),
            selectinload(Game.teams).selectinload(TeamAssignment.user),
            selectinload(Game.result).selectinload(GameResult.team_scores),
            selectinload(Game.run),
        )
    )
    game = game_result.scalar_one_or_none()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    if game.run_id != data["run_id"]:
        raise HTTPException(status_code=404, detail="Game not found in this run")

    user_result = await db.execute(select(User).where(User.id == data["user_id"]))
    user = user_result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=404, detail="Player not found")

    return game, user, data


@router.get("", response_model=GameActionResponse)
async def get_game_action(
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Get game info and player context for the mobile action page."""
    game, user, data = await _get_token_context(token, db)

    # Get RSVP status
    my_rsvp = next((r for r in game.rsvps if r.user_id == user.id), None)

    # Build team info
    teams_data = None
    my_team = None
    if game.teams:
        team_map = {}
        for t in game.teams:
            if t.team not in team_map:
                team_map[t.team] = {"team_name": t.team_name, "players": []}
            team_map[t.team]["players"].append({
                "id": t.user_id,
                "name": t.user.full_name if t.user else f"Player #{t.user_id}",
            })
            if t.user_id == user.id:
                my_team = t.team_name
        teams_data = list(team_map.values())

    # Build voting info
    voting_open = False
    voting_deadline = None
    my_votes = None
    participants = None
    awards = None

    if game.status == GameStatus.COMPLETED:
        from datetime import timedelta
        game_time = game.game_date
        if game_time.tzinfo is None:
            game_time = game_time.replace(tzinfo=timezone.utc)
        deadline = (game_time + timedelta(days=1)).replace(hour=12, minute=0, second=0, microsecond=0)
        now = datetime.now(timezone.utc)
        voting_open = now <= deadline
        voting_deadline = deadline.isoformat()

        # Get participants for voting
        if game.teams:
            participants = [
                {"id": t.user_id, "name": t.user.full_name if t.user else f"Player #{t.user_id}"}
                for t in game.teams
            ]
            # Deduplicate
            seen = set()
            unique_participants = []
            for p in participants:
                if p["id"] not in seen:
                    seen.add(p["id"])
                    unique_participants.append(p)
            participants = unique_participants

        # Get my votes
        votes_result = await db.execute(
            select(GameVote).where(GameVote.game_id == game.id, GameVote.voter_id == user.id)
        )
        votes = votes_result.scalars().all()
        my_votes = {}
        for v in votes:
            my_votes[v.vote_type.value] = v.nominee_id

        # Get awards if voting closed
        if not voting_open:
            awards = {}
            for vtype in [VoteType.MVP, VoteType.SHAQTIN, VoteType.XFACTOR]:
                winner_result = await db.execute(
                    select(GameVote.nominee_id, func.count(GameVote.id).label("cnt"))
                    .where(GameVote.game_id == game.id, GameVote.vote_type == vtype)
                    .group_by(GameVote.nominee_id)
                    .order_by(func.count(GameVote.id).desc())
                    .limit(1)
                )
                row = winner_result.one_or_none()
                if row:
                    winner_user = await db.execute(select(User).where(User.id == row[0]))
                    w = winner_user.scalar_one_or_none()
                    if w:
                        awards[vtype.value] = {"name": w.full_name, "votes": row[1]}

    # Build score info
    score_text = None
    if game.result and game.result.team_scores:
        score_text = " - ".join(
            f"{ts.team_name} {ts.wins}" for ts in sorted(game.result.team_scores, key=lambda x: x.wins, reverse=True)
        )

    return GameActionResponse(
        game_id=game.id,
        run_id=game.run_id,
        run_name=game.run.name if game.run else "Unknown",
        title=game.title,
        game_date=game.game_date.isoformat(),
        location=game.location,
        status=game.status.value,
        roster_size=game.roster_size,
        accepted_count=game.accepted_count,
        notes=game.notes or score_text,
        user_id=user.id,
        user_name=user.full_name,
        rsvp_status=my_rsvp.status.value if my_rsvp else None,
        teams=teams_data,
        my_team=my_team,
        voting_open=voting_open,
        voting_deadline=voting_deadline,
        my_votes=my_votes,
        participants=participants,
        awards=awards,
    )


@router.post("/rsvp")
async def rsvp_via_token(
    action: RSVPAction,
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """RSVP to a game via token (no login required)."""
    game, user, data = await _get_token_context(token, db)

    if game.status in (GameStatus.COMPLETED, GameStatus.CANCELLED, GameStatus.SKIPPED):
        raise HTTPException(status_code=400, detail="Cannot RSVP to this game")

    rsvp_status = RSVPStatus(action.status)

    # Check for existing RSVP
    existing = next((r for r in game.rsvps if r.user_id == user.id), None)

    if existing:
        existing.status = rsvp_status
        existing.responded_at = datetime.utcnow()
    else:
        # Handle waitlist for drop-ins
        if rsvp_status == RSVPStatus.ACCEPTED and game.spots_remaining <= 0:
            rsvp_status = RSVPStatus.WAITLIST

        rsvp = RSVP(
            game_id=game.id,
            user_id=user.id,
            status=rsvp_status,
            responded_at=datetime.utcnow(),
        )
        db.add(rsvp)

    await db.flush()
    return {"status": "ok", "rsvp_status": rsvp_status.value}


@router.post("/vote")
async def vote_via_token(
    action: VoteAction,
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Cast a vote via token (no login required)."""
    game, user, data = await _get_token_context(token, db)

    if game.status != GameStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Voting is only available for completed games")

    # Check voting window
    from datetime import timedelta
    game_time = game.game_date
    if game_time.tzinfo is None:
        game_time = game_time.replace(tzinfo=timezone.utc)
    deadline = (game_time + timedelta(days=1)).replace(hour=12, minute=0, second=0, microsecond=0)
    if datetime.now(timezone.utc) > deadline:
        raise HTTPException(status_code=400, detail="Voting window has closed")

    # Verify voter is a participant
    is_participant = any(t.user_id == user.id for t in game.teams)
    if not is_participant:
        raise HTTPException(status_code=403, detail="Only game participants can vote")

    if action.nominee_id == user.id:
        raise HTTPException(status_code=400, detail="You cannot vote for yourself")

    # Verify nominee is a participant
    nominee_is_participant = any(t.user_id == action.nominee_id for t in game.teams)
    if not nominee_is_participant:
        raise HTTPException(status_code=400, detail="Nominee must be a game participant")

    vote_type = VoteType(action.vote_type)

    # Upsert
    existing_result = await db.execute(
        select(GameVote).where(
            GameVote.game_id == game.id,
            GameVote.voter_id == user.id,
            GameVote.vote_type == vote_type,
        )
    )
    existing = existing_result.scalar_one_or_none()

    if existing:
        existing.nominee_id = action.nominee_id
        existing.created_at = datetime.utcnow()
    else:
        db.add(GameVote(
            game_id=game.id,
            voter_id=user.id,
            nominee_id=action.nominee_id,
            vote_type=vote_type,
        ))

    await db.flush()
    return {"status": "ok", "vote_type": action.vote_type, "nominee_id": action.nominee_id}
