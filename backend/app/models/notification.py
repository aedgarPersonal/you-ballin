"""
Notification Model
==================
Tracks in-app notifications and delivery status for email/SMS.

TEACHING NOTE:
    Every notification is stored in the database for the in-app feed.
    Email and SMS delivery are tracked separately so we can retry failures
    and show delivery status to admins.
"""

import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class NotificationType(str, enum.Enum):
    """Categories of notifications."""
    GAME_INVITE = "game_invite"          # Weekly game invitation
    DROPIN_AVAILABLE = "dropin_available"  # Spots opened for drop-ins
    RSVP_REMINDER = "rsvp_reminder"      # Reminder before deadline
    TEAMS_PUBLISHED = "teams_published"  # Teams are set
    REGISTRATION_APPROVED = "registration_approved"
    REGISTRATION_DENIED = "registration_denied"
    AWARDS_ANNOUNCED = "awards_announced"
    VOTING_OPEN = "voting_open"
    GAME_CANCELLED = "game_cancelled"
    GAME_UPDATED = "game_updated"
    GAME_COMPLETED = "game_completed"
    STATUS_CHANGED = "status_changed"
    GENERAL = "general"
    PLAYER_SUGGESTED = "player_suggested"
    SUGGESTION_ACCEPTED = "suggestion_accepted"
    SUGGESTION_DECLINED = "suggestion_declined"


class Notification(Base):
    """A notification sent to a user via email, SMS, and/or in-app."""

    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    run_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("runs.id"), nullable=True)
    type: Mapped[NotificationType] = mapped_column(
        Enum(NotificationType, values_callable=lambda x: [e.value for e in x]), nullable=False,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)

    # --- Deep link for in-app navigation ---
    action_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # --- Delivery tracking ---
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    email_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    sms_sent: Mapped[bool] = mapped_column(Boolean, default=False)

    # --- Timestamps ---
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # --- Relationships ---
    user = relationship("User", back_populates="notifications")

    def __repr__(self) -> str:
        return f"<Notification {self.type.value} for user={self.user_id}>"
