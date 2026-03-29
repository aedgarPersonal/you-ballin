"""
Season Archive Model
====================
Stores snapshots of player stats from previous seasons.
Games, results, and votes are preserved in-place — only
the run_player_stats are reset for the new season.
"""

from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SeasonArchive(Base):
    """A snapshot of a completed season."""

    __tablename__ = "season_archives"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[int] = mapped_column(Integer, ForeignKey("runs.id"), nullable=False)
    label: Mapped[str] = mapped_column(String(200), nullable=False)  # e.g., "Season 1 (Jun 2025 - Mar 2026)"
    start_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    end_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    total_games: Mapped[int] = mapped_column(Integer, default=0)
    total_players: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # Relationships
    player_snapshots = relationship("SeasonPlayerSnapshot", back_populates="season", lazy="selectin")


class SeasonPlayerSnapshot(Base):
    """A player's stats at the end of a season."""

    __tablename__ = "season_player_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    season_id: Mapped[int] = mapped_column(Integer, ForeignKey("season_archives.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)

    games_played: Mapped[int] = mapped_column(Integer, default=0)
    games_won: Mapped[int] = mapped_column(Integer, default=0)
    win_rate: Mapped[float] = mapped_column(Float, default=0.5)
    avg_scoring: Mapped[float] = mapped_column(Float, default=3.0)
    avg_defense: Mapped[float] = mapped_column(Float, default=3.0)
    avg_overall: Mapped[float] = mapped_column(Float, default=3.0)
    avg_athleticism: Mapped[float] = mapped_column(Float, default=3.0)
    avg_fitness: Mapped[float] = mapped_column(Float, default=3.0)
    mvp_count: Mapped[int] = mapped_column(Integer, default=0)
    shaqtin_count: Mapped[int] = mapped_column(Integer, default=0)
    xfactor_count: Mapped[int] = mapped_column(Integer, default=0)

    # Relationships
    season = relationship("SeasonArchive", back_populates="player_snapshots")
    user = relationship("User")
