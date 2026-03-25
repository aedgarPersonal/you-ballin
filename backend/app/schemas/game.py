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
    num_teams: int = Field(default=2, ge=2, le=8)


class GameUpdate(BaseModel):
    """Updateable game fields."""
    title: str | None = None
    game_date: datetime | None = None
    location: str | None = None
    notes: str | None = None
    status: str | None = None
    roster_size: int | None = Field(None, ge=2, le=30)
    num_teams: int | None = Field(None, ge=2, le=8)


class GameResponse(BaseModel):
    """Game data returned by the API."""
    id: int
    run_id: int
    title: str
    game_date: datetime
    location: str
    notes: str | None
    status: str
    roster_size: int
    num_teams: int
    accepted_count: int
    spots_remaining: int
    commentary: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class GameDetailResponse(GameResponse):
    """Game with full RSVP, team, and result details."""
    rsvps: list["RSVPResponse"]
    teams: list["TeamAssignmentResponse"]
    result: "GameResultResponse | None" = None


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
    team: str       # "team_1", "team_2", etc.
    team_name: str  # Fun display name like "Boomshakalaka"
    user: UserResponse | None = None

    model_config = {"from_attributes": True}


class TeamScoreInput(BaseModel):
    """Per-team score for recording game results."""
    team: str = Field(description="team identifier, e.g. team_1")
    wins: int = Field(ge=0, description="number of games this team won")


class GameResultCreate(BaseModel):
    """Admin records the game outcome with per-team scores."""
    team_scores: list[TeamScoreInput] = Field(min_length=2)
    notes: str | None = None


class TeamScoreResponse(BaseModel):
    """Per-team score data returned by the API."""
    team: str
    team_name: str
    wins: int

    model_config = {"from_attributes": True}


class GameResultResponse(BaseModel):
    """Game outcome data with per-team scores."""
    id: int
    game_id: int
    team_scores: list[TeamScoreResponse]
    notes: str | None

    model_config = {"from_attributes": True}
