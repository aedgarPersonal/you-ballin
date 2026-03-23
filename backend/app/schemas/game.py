"""
Game & RSVP Schemas
===================
Request/response shapes for game management and RSVPs.
"""

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.user import UserResponse


class GameCreate(BaseModel):
    """Data to create a new game."""
    title: str = Field(max_length=200)
    game_date: datetime
    location: str = Field(max_length=300, default="TBD")
    notes: str | None = None
    roster_size: int = Field(default=16, ge=2, le=30)


class GameUpdate(BaseModel):
    """Updateable game fields."""
    title: str | None = None
    game_date: datetime | None = None
    location: str | None = None
    notes: str | None = None
    status: str | None = None
    roster_size: int | None = Field(None, ge=2, le=30)


class GameResponse(BaseModel):
    """Game data returned by the API."""
    id: int
    title: str
    game_date: datetime
    location: str
    notes: str | None
    status: str
    roster_size: int
    accepted_count: int
    spots_remaining: int
    created_at: datetime

    model_config = {"from_attributes": True}


class GameDetailResponse(GameResponse):
    """Game with full RSVP and team details."""
    rsvps: list["RSVPResponse"]
    teams: list["TeamAssignmentResponse"]


# =============================================================================
# RSVP Schemas
# =============================================================================

class RSVPCreate(BaseModel):
    """Player responding to a game invitation."""
    status: str = Field(description="accepted, declined, or waitlist")


class RSVPResponse(BaseModel):
    """RSVP data returned by the API."""
    id: int
    game_id: int
    user_id: int
    status: str
    responded_at: datetime | None
    user: UserResponse | None = None

    model_config = {"from_attributes": True}


# =============================================================================
# Team Schemas
# =============================================================================

class TeamAssignmentResponse(BaseModel):
    """A player's team assignment for a game."""
    id: int
    game_id: int
    user_id: int
    team: str  # team_a or team_b
    is_starter: bool
    user: UserResponse | None = None

    model_config = {"from_attributes": True}


class GameResultCreate(BaseModel):
    """Admin records the game outcome."""
    winning_team: str = Field(description="team_a or team_b")
    score_team_a: int | None = None
    score_team_b: int | None = None
    notes: str | None = None


class GameResultResponse(BaseModel):
    """Game outcome data."""
    id: int
    game_id: int
    winning_team: str
    score_team_a: int | None
    score_team_b: int | None
    notes: str | None

    model_config = {"from_attributes": True}
