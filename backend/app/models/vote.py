"""
Game Award Voting Model
=======================
Weekly MVP and "Shaqtin' a Fool" votes cast by game participants.

TEACHING NOTE:
    After each game, players who participated can vote for:
    - MVP: The player who had the best overall performance
    - Shaqtin' a Fool: The player who made the single worst play
    - X Factor: The player who made the biggest impact / game-changer

    Rules:
    - Only players who were on a team for that game can vote
    - Each player gets one vote per category per game
    - Players cannot vote for themselves
    - Voting closes 24 hours after game time
    - Results are published on the public page after voting closes

    The composite unique constraint on (game_id, voter_id, vote_type)
    ensures one vote per category per voter per game.
"""

import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class VoteType(str, enum.Enum):
    """The three award categories."""
    MVP = "mvp"
    SHAQTIN = "shaqtin"
    XFACTOR = "xfactor"


class GameVote(Base):
    """A single vote cast by a participant for a game award."""

    __tablename__ = "game_votes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    game_id: Mapped[int] = mapped_column(Integer, ForeignKey("games.id"), nullable=False)
    voter_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    nominee_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    vote_type: Mapped[VoteType] = mapped_column(
        Enum(VoteType, values_callable=lambda x: [e.value for e in x]), nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # --- Relationships ---
    game = relationship("Game")
    voter = relationship("User", foreign_keys=[voter_id])
    nominee = relationship("User", foreign_keys=[nominee_id])

    # One vote per category per voter per game
    __table_args__ = (
        UniqueConstraint("game_id", "voter_id", "vote_type", name="uq_game_voter_type"),
    )

    def __repr__(self) -> str:
        return f"<GameVote game={self.game_id} {self.vote_type.value}: voter={self.voter_id} -> nominee={self.nominee_id}>"
