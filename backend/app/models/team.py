"""
Team & Game Result Models
=========================
Stores team assignments and game outcomes for Win Rate tracking.

TEACHING NOTE:
    After the team balancing algorithm runs, each accepted player is assigned
    to a team. The number of teams is configurable per game (default 2).
    Each team gets a random fun basketball-themed name.

    After the game, an admin records the scores for each team (e.g.,
    Team A won 3 games, Team B won 2). This feeds into the `jordan_factor`
    (Win Rate) on the User model, which tracks each player's historical win
    percentage (games_won / games_played). Win Rate is used by the team
    balancing algorithm to create fair teams.
"""

import random
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


# =============================================================================
# Fun Basketball Team Names
# =============================================================================

TEAM_NAMES = [
    # Classic basketball vibes
    "Rim Rattlers", "Ankle Breakers", "Brick City", "Glass Cleaners",
    "Splash Zone", "Downtown Snipers", "And-One Crew", "Swat Team",
    "Full Court Press", "Fast Break Frenzy", "Triple Threats", "Alley-Oop Gang",
    # NBA Jam / retro arcade
    "Boomshakalaka", "He's On Fire", "From Downtown", "Is It The Shoes?",
    "Monster Jam", "Heating Up", "Can't Buy A Bucket", "Posterized",
    # Playground legends
    "Blacktop Kings", "Streetball Legends", "Bucket Brigade", "The Dish Crew",
    "No-Look Nation", "Crossover Kings", "Euro Step Elite", "Fadeaway Factory",
    # Fun / silly
    "Air Balls United", "Traveling Circus", "The Flop Squad", "Foul Trouble",
    "Bench Warmers", "Shot Clock Violators", "Technical Foul FC", "Hack-a-Squad",
    # Legendary references
    "Dream Team", "Showtime", "Bad Boys", "Lob City",
    "Murderers' Row", "The Island", "Point Gods", "Unicorn Club",
]


def pick_team_names(n: int) -> list[str]:
    """Pick n unique random team names."""
    if n > len(TEAM_NAMES):
        # If we somehow need more names than we have, allow repeats with numbers
        names = random.sample(TEAM_NAMES, len(TEAM_NAMES))
        for i in range(n - len(TEAM_NAMES)):
            names.append(f"Squad #{i + len(TEAM_NAMES) + 1}")
        return names
    return random.sample(TEAM_NAMES, n)


class TeamAssignment(Base):
    """Assigns a player to a team for a specific game.

    TEACHING NOTE:
        The `team` field stores a string identifier like "team_1", "team_2", etc.
        The `team_name` field stores the fun display name (e.g., "Boomshakalaka").
        Every player is a starter — no bench distinction.
    """

    __tablename__ = "team_assignments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    game_id: Mapped[int] = mapped_column(Integer, ForeignKey("games.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    team: Mapped[str] = mapped_column(String(20), nullable=False)  # "team_1", "team_2", etc.
    team_name: Mapped[str] = mapped_column(String(100), nullable=False, default="")  # Fun display name

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # --- Relationships ---
    game = relationship("Game", back_populates="teams")
    user = relationship("User")

    def __repr__(self) -> str:
        return f"<TeamAssignment user={self.user_id} team={self.team} ({self.team_name})>"


class GameResult(Base):
    """Records the outcome of a completed game night.

    TEACHING NOTE:
        A game night can have multiple individual games (e.g., best of 5).
        The per-team scores are stored in TeamScore rows linked to this result.
        The system updates each player's Win Rate based on their team's
        wins relative to total games played that night.
    """

    __tablename__ = "game_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    game_id: Mapped[int] = mapped_column(Integer, ForeignKey("games.id"), unique=True, nullable=False)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # --- Relationships ---
    game = relationship("Game", back_populates="result")
    team_scores = relationship("TeamScore", back_populates="game_result", lazy="selectin")

    def __repr__(self) -> str:
        return f"<GameResult game={self.game_id}>"


class TeamScore(Base):
    """Per-team win count for a game night.

    TEACHING NOTE:
        One row per team per game result. For example, if Team A won 3 games
        and Team B won 2, there are two TeamScore rows with wins=3 and wins=2.
        Total games played that night = sum of all teams' wins.
    """

    __tablename__ = "team_scores"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    game_result_id: Mapped[int] = mapped_column(Integer, ForeignKey("game_results.id"), nullable=False)
    team: Mapped[str] = mapped_column(String(20), nullable=False)  # "team_1", "team_2"
    team_name: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    wins: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # --- Relationships ---
    game_result = relationship("GameResult", back_populates="team_scores")

    def __repr__(self) -> str:
        return f"<TeamScore team={self.team} wins={self.wins}>"
