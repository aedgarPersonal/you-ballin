"""
Rating Schemas
==============
Request/response shapes for the anonymous player rating system.
"""

from datetime import datetime

from pydantic import BaseModel, Field


class RatingCreate(BaseModel):
    """Submit or update a rating for a player.

    TEACHING NOTE:
        All three dimensions are required. The rater_id is extracted
        from the JWT token - it's never sent by the client, ensuring
        anonymity in the API layer.
    """
    offense: float = Field(ge=1.0, le=5.0, description="Offensive skill (1-5)")
    defense: float = Field(ge=1.0, le=5.0, description="Defensive skill (1-5)")
    overall: float = Field(ge=1.0, le=5.0, description="Overall skill (1-5)")


class RatingResponse(BaseModel):
    """A single rating (rater identity is NEVER included)."""
    id: int
    player_id: int
    offense: float
    defense: float
    overall: float
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PlayerRatingSummary(BaseModel):
    """Aggregated ratings for a player's profile page."""
    player_id: int
    avg_offense: float
    avg_defense: float
    avg_overall: float
    total_ratings: int
    jordan_factor: float
    games_played: int
    games_won: int


class MyRatingForPlayer(BaseModel):
    """The current user's rating for a specific player.

    TEACHING NOTE:
        This lets the frontend show the user their own existing rating
        when they visit a player's profile, so they know what they
        previously rated and can update if eligible.
    """
    has_rated: bool
    rating: RatingResponse | None = None
    can_update: bool  # False if updated within the last month
    next_update_available: datetime | None = None
