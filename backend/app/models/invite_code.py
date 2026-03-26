"""
InviteCode Model
================
Admin-generated invite codes for closed registration.
Each code is tied to a specific Run and allows new users to register.
"""

import secrets
import string
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

# Charset excludes ambiguous characters (0/O, 1/I/L)
_CODE_CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def generate_code(length: int = 8) -> str:
    """Generate a short, human-readable invite code."""
    return "".join(secrets.choice(_CODE_CHARSET) for _ in range(length))


class InviteCode(Base):
    __tablename__ = "invite_codes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    run_id: Mapped[int] = mapped_column(Integer, ForeignKey("runs.id"), nullable=False)
    created_by_user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)

    # Configuration
    max_uses: Mapped[int | None] = mapped_column(Integer, nullable=True)  # None = unlimited
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Tracking
    use_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # Relationships
    run = relationship("Run")
    created_by = relationship("User")
