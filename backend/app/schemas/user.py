"""
User Schemas (Pydantic)
=======================
Define the shape of data flowing in and out of the API.

TEACHING NOTE:
    Pydantic models serve as both validation and documentation:
    - "Create" schemas validate incoming POST data
    - "Update" schemas validate PATCH data (all fields optional)
    - "Response" schemas control what data is sent to the client
    - "InDB" schemas include private fields only for internal use

    This separation prevents leaking sensitive data (like password hashes)
    and ensures clients send exactly the data we expect.
"""

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


# =============================================================================
# Authentication Schemas
# =============================================================================

class UserRegister(BaseModel):
    """Data required to register a new account."""
    email: EmailStr
    username: str = Field(min_length=3, max_length=100)
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=200)
    phone: str | None = None
    avatar_url: str | None = None  # Legacy NBA player ID for avatar


class UserLogin(BaseModel):
    """Email/password login."""
    email: EmailStr
    password: str


class MagicLinkRequest(BaseModel):
    """Request a magic link login via email."""
    email: EmailStr


class TokenResponse(BaseModel):
    """JWT token returned after successful authentication."""
    access_token: str
    token_type: str = "bearer"
    user: "UserResponse"


# =============================================================================
# User CRUD Schemas
# =============================================================================

class UserUpdate(BaseModel):
    """Fields a user can update about themselves."""
    full_name: str | None = None
    phone: str | None = None
    avatar_url: str | None = None
    height_inches: int | None = Field(None, ge=48, le=96)
    age: int | None = Field(None, ge=14, le=80)


class AdminUserUpdate(BaseModel):
    """Fields an admin can update on a player.

    For super admin: role and is_active (user-level fields).
    For run admin: player_status, dues_paid (run-level), plus profile/physical/stats on User.
    """
    # Profile fields
    full_name: str | None = Field(None, min_length=1, max_length=200)
    email: str | None = None
    username: str | None = Field(None, min_length=3, max_length=100)
    phone: str | None = None
    avatar_url: str | None = None
    # Run membership fields
    player_status: str | None = None  # regular, dropin, inactive
    dues_paid: bool | None = None
    # Super admin only
    role: str | None = None  # player, super_admin
    is_active: bool | None = None
    # Physical stats
    height_inches: int | None = None
    age: int | None = None
    mobility: float | None = Field(None, ge=1.0, le=5.0)
    # Rating overrides
    avg_offense: float | None = Field(None, ge=1.0, le=5.0)
    avg_defense: float | None = Field(None, ge=1.0, le=5.0)
    avg_overall: float | None = Field(None, ge=1.0, le=5.0)
    # Game stats (for manual correction)
    games_played: int | None = Field(None, ge=0)
    games_won: int | None = Field(None, ge=0)


class QuickAddPlayer(BaseModel):
    """Quick add a single player to a run."""
    full_name: str = Field(min_length=1, max_length=200)
    email: str = Field(min_length=3, max_length=255)
    phone: str | None = None
    wins: int = Field(default=0, ge=0)
    losses: int = Field(default=0, ge=0)
    height_inches: int | None = Field(default=70, ge=48, le=96)
    age: int | None = Field(default=30, ge=16, le=70)
    mobility: float | None = Field(default=3.0, ge=1.0, le=5.0)
    avg_offense: float = Field(default=3.0, ge=1.0, le=5.0)
    avg_defense: float = Field(default=3.0, ge=1.0, le=5.0)
    avg_overall: float = Field(default=3.0, ge=1.0, le=5.0)


class UserResponse(BaseModel):
    """Public user profile returned by the API.

    Note: mobility, avg_offense, avg_defense, avg_overall are included
    for admin use (team balancing). The frontend is responsible for
    hiding these from non-admin users.
    """
    id: int
    email: str
    username: str
    full_name: str
    avatar_url: str | None
    phone: str | None
    role: str
    player_status: str
    height_inches: int | None
    age: int | None
    mobility: float | None
    avg_offense: float
    avg_defense: float
    avg_overall: float
    jordan_factor: float
    games_played: int
    games_won: int
    mvp_count: int = 0
    shaqtin_count: int = 0
    xfactor_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class UserListResponse(BaseModel):
    """Paginated list of users."""
    users: list[UserResponse]
    total: int


# =============================================================================
# Import Schemas
# =============================================================================

class ImportPlayerEntry(BaseModel):
    """A single player to import."""
    name: str = Field(min_length=1, max_length=200)
    email: str = Field(min_length=3, max_length=255)
    wins: int = Field(default=0, ge=0)
    losses: int = Field(default=0, ge=0)


class ImportPlayersRequest(BaseModel):
    """Bulk import request containing a list of players."""
    players: list[ImportPlayerEntry] = Field(min_length=1)


class ImportPlayersResponse(BaseModel):
    """Result of a bulk import operation."""
    created_count: int
    skipped_count: int
    created_players: list[str]
    skipped_players: list[str]
