from datetime import datetime

from pydantic import BaseModel, Field


class RunCreate(BaseModel):
    name: str = Field(max_length=200)
    description: str | None = None
    default_location: str = Field(max_length=300, default="TBD")
    default_game_day: int | None = Field(None, ge=0, le=6)
    default_game_time: str | None = None
    default_roster_size: int = Field(default=16, ge=2, le=30)
    default_num_teams: int = Field(default=2, ge=2, le=8)
    dues_amount: float | None = None


class RunUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    default_location: str | None = None
    default_game_day: int | None = Field(None, ge=0, le=6)
    default_game_time: str | None = None
    default_roster_size: int | None = Field(None, ge=2, le=30)
    default_num_teams: int | None = Field(None, ge=2, le=8)
    dues_amount: float | None = None
    is_active: bool | None = None


class RunResponse(BaseModel):
    id: int
    name: str
    description: str | None
    default_location: str
    default_game_day: int | None
    default_game_time: str | None
    default_roster_size: int
    default_num_teams: int
    dues_amount: float | None
    is_active: bool
    created_at: datetime
    model_config = {"from_attributes": True}


class RunMembershipResponse(BaseModel):
    id: int
    run_id: int
    user_id: int
    player_status: str
    dues_paid: bool
    notify_email: bool
    notify_sms: bool
    joined_at: datetime
    user: "UserResponse | None" = None
    model_config = {"from_attributes": True}


# Import UserResponse for the forward ref
from app.schemas.user import UserResponse


class RunMembershipUpdate(BaseModel):
    player_status: str | None = None
    dues_paid: bool | None = None
    notify_email: bool | None = None
    notify_sms: bool | None = None


class RunAdminResponse(BaseModel):
    id: int
    run_id: int
    user_id: int
    user: UserResponse | None = None
    model_config = {"from_attributes": True}


class RunPlayerStatsResponse(BaseModel):
    run_id: int
    user_id: int
    games_played: int
    games_won: int
    jordan_factor: float
    avg_offense: float
    avg_defense: float
    avg_overall: float
    mvp_count: int
    shaqtin_count: int
    xfactor_count: int
    model_config = {"from_attributes": True}
