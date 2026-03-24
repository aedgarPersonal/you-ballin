from datetime import date, datetime

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
    skill_level: int = Field(default=5, ge=1, le=5)
    needs_players: bool = False
    start_date: date | None = None
    end_date: date | None = None


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
    skill_level: int | None = Field(None, ge=1, le=5)
    needs_players: bool | None = None
    start_date: date | None = None
    end_date: date | None = None


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
    skill_level: int
    needs_players: bool
    start_date: date | None = None
    end_date: date | None = None
    created_at: datetime
    is_admin: bool = False
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


class PlayerSuggestionCreate(BaseModel):
    suggested_user_id: int
    message: str | None = None


class PlayerSuggestionAction(BaseModel):
    status: str = Field(description="accepted or declined")


class PlayerSuggestionResponse(BaseModel):
    id: int
    run_id: int
    suggested_user_id: int
    suggested_by_user_id: int
    message: str | None
    status: str
    created_at: datetime
    resolved_at: datetime | None = None
    resolved_by_user_id: int | None = None
    suggested_user: UserResponse | None = None
    suggested_by: UserResponse | None = None
    run: RunResponse | None = None
    model_config = {"from_attributes": True}
