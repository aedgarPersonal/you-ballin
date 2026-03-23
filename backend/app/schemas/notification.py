"""
Notification Schemas
====================
Request/response shapes for the notification system.
"""

from datetime import datetime

from pydantic import BaseModel


class NotificationResponse(BaseModel):
    """A notification in the user's feed."""
    id: int
    type: str
    title: str
    message: str
    read: bool
    email_sent: bool
    sms_sent: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationListResponse(BaseModel):
    """Paginated notification list."""
    notifications: list[NotificationResponse]
    total: int
    unread_count: int
