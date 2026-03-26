"""Invite Code Schemas."""

from datetime import datetime
from pydantic import BaseModel, Field


class InviteCodeCreate(BaseModel):
    """Create a new invite code."""
    max_uses: int | None = Field(default=None, ge=1, description="Max number of uses (None = unlimited)")
    expires_at: datetime | None = Field(default=None, description="Expiration datetime (None = never)")


class InviteCodeResponse(BaseModel):
    """Invite code data returned by the API."""
    id: int
    code: str
    run_id: int
    created_by_user_id: int
    max_uses: int | None
    expires_at: datetime | None
    is_active: bool
    use_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class InviteCodeValidateResponse(BaseModel):
    """Result of validating an invite code (public, no auth)."""
    valid: bool
    run_name: str | None = None
    run_id: int | None = None
    message: str
