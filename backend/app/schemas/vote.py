"""
Vote Schemas
============
Request/response shapes for the MVP, Shaqtin' a Fool, and X Factor voting system.
"""

from datetime import datetime

from pydantic import BaseModel

from app.schemas.user import UserResponse


class VoteCast(BaseModel):
    """Submit a vote for MVP, Shaqtin', or X Factor."""
    nominee_id: int
    vote_type: str  # "mvp", "shaqtin", or "xfactor"


class VoteResponse(BaseModel):
    """A single vote record (voter identity hidden on public endpoints)."""
    id: int
    game_id: int
    nominee_id: int
    vote_type: str
    created_at: datetime

    model_config = {"from_attributes": True}


class MyVotesResponse(BaseModel):
    """The current user's votes for a specific game."""
    mvp_vote: VoteResponse | None = None
    shaqtin_vote: VoteResponse | None = None
    xfactor_vote: VoteResponse | None = None


class AwardWinner(BaseModel):
    """A single award winner with vote count."""
    player: UserResponse
    vote_count: int


class GameAwardsResponse(BaseModel):
    """Public award results for a completed game."""
    game_id: int
    voting_open: bool
    voting_deadline: datetime | None = None
    total_voters: int
    votes_cast: int
    mvp: AwardWinner | None = None
    shaqtin: AwardWinner | None = None
    xfactor: AwardWinner | None = None
    commentary: str | None = None


class RecentGameAwards(BaseModel):
    """Award winners for a single completed game (dashboard view)."""
    game_id: int
    game_title: str
    game_date: datetime
    mvp: AwardWinner | None = None
    shaqtin: AwardWinner | None = None
    xfactor: AwardWinner | None = None
