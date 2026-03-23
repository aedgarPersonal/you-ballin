"""
Team & Game Result Models
=========================
Stores team assignments and game outcomes for the Jordan Factor.

TEACHING NOTE:
    After the team balancing algorithm runs, each accepted player is assigned
    to Team A or Team B. After the game, an admin records which team won.
    This feeds into the `jordan_factor` on the User model, which tracks
    each player's historical win percentage (games_won / games_played).
    The Jordan Factor is used by the team balancing algorithm to create
    fair teams — players who win a lot get balanced against each other.
"""

import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class TeamSide(str, enum.Enum):
    """Which team a player is on."""
    TEAM_A = "team_a"
    TEAM_B = "team_b"


class TeamAssignment(Base):
    """Assigns a player to a team for a specific game."""

    __tablename__ = "team_assignments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    game_id: Mapped[int] = mapped_column(Integer, ForeignKey("games.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    team: Mapped[TeamSide] = mapped_column(Enum(TeamSide), nullable=False)
    is_starter: Mapped[bool] = mapped_column(default=True)  # vs substitute

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # --- Relationships ---
    game = relationship("Game", back_populates="teams")
    user = relationship("User")

    def __repr__(self) -> str:
        return f"<TeamAssignment user={self.user_id} team={self.team.value}>"


class GameResult(Base):
    """Records the outcome of a completed game.

    TEACHING NOTE:
        After each game, an admin records the winner. The system then
        updates each player's Jordan Factor (games_won, games_played,
        jordan_factor = won/played) based on whether they were on the
        winning team. This creates a feedback loop that improves future
        team balancing.
    """

    __tablename__ = "game_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    game_id: Mapped[int] = mapped_column(Integer, ForeignKey("games.id"), unique=True, nullable=False)
    winning_team: Mapped[TeamSide] = mapped_column(Enum(TeamSide), nullable=False)
    score_team_a: Mapped[int | None] = mapped_column(Integer, nullable=True)
    score_team_b: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # --- Relationships ---
    game = relationship("Game", back_populates="result")

    def __repr__(self) -> str:
        return f"<GameResult game={self.game_id} winner={self.winning_team.value}>"
