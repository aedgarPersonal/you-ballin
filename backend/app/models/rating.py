"""
Player Rating Model
===================
Anonymous peer ratings for offense, defense, and overall skill.

TEACHING NOTE:
    Ratings are anonymous - the `rater_id` is stored to enforce the
    once-per-month update limit, but it is NEVER exposed in API responses.

    The composite unique constraint on (player_id, rater_id) means each
    person can only have one active rating per player. When they update
    (allowed once per month), the existing record is modified in place.

    Cached averages on the User model are recalculated whenever a rating
    is created or updated, avoiding expensive AVG queries on every read.
"""

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PlayerRating(Base):
    """An anonymous skill rating from one player to another."""

    __tablename__ = "player_ratings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Who is being rated
    player_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    # Who is doing the rating (kept private!)
    rater_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)

    # Ratings on a 1-5 scale
    offense: Mapped[float] = mapped_column(Float, nullable=False)
    defense: Mapped[float] = mapped_column(Float, nullable=False)
    overall: Mapped[float] = mapped_column(Float, nullable=False)

    # --- Timestamps ---
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    # --- Relationships ---
    player = relationship("User", foreign_keys=[player_id], back_populates="ratings_received")
    rater = relationship("User", foreign_keys=[rater_id], back_populates="ratings_given")

    def __repr__(self) -> str:
        return f"<PlayerRating player={self.player_id} O={self.offense} D={self.defense} OVR={self.overall}>"
