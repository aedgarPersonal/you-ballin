"""Push Subscription Schemas."""

from datetime import datetime

from pydantic import BaseModel


class PushSubscriptionCreate(BaseModel):
    endpoint: str
    p256dh_key: str
    auth_key: str
    user_agent: str | None = None


class PushSubscriptionResponse(BaseModel):
    id: int
    endpoint: str
    created_at: datetime

    model_config = {"from_attributes": True}


class VapidPublicKeyResponse(BaseModel):
    public_key: str
