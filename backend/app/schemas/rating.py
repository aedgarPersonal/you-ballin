"""
Rating Schemas
==============
Request/response shapes for the anonymous player rating system.
"""

from datetime import datetime

from pydantic import BaseModel, Field


class RatingCreate(BaseModel):
    """Submit or update a rating for a player."""
    scoring: float = Field(ge=1.0, le=5.0, description="Scoring ability (1-5)")
    defense: float = Field(ge=1.0, le=5.0, description="Defensive skill (1-5)")
    overall: float = Field(ge=1.0, le=5.0, description="Overall skill (1-5)")
    athleticism: float = Field(ge=1.0, le=5.0, description="Athleticism (1-5)")
    fitness: float = Field(ge=1.0, le=5.0, description="Fitness level (1-5)")


class RatingResponse(BaseModel):
    """A single rating (rater identity is NEVER included)."""
    id: int
    player_id: int
    scoring: float
    defense: float
    overall: float
    athleticism: float
    fitness: float
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PlayerRatingSummary(BaseModel):
    """Aggregated ratings for a player's profile page."""
    player_id: int
    total_ratings: int
    win_rate: float
    games_played: int
    games_won: int


class MyRatingForPlayer(BaseModel):
    """The current user's rating for a specific player."""
    has_rated: bool
    rating: RatingResponse | None = None
    can_update: bool  # False if updated within the last month
    next_update_available: datetime | None = None
