"""
Team & Game Result Models
=========================
Stores team assignments and game outcomes for the Jordan Factor.

TEACHING NOTE:
    After the team balancing algorithm runs, each accepted player is assigned
    to a team. The number of teams is configurable per game (default 2).
    Each team gets a random fun basketball-themed name.

    After the game, an admin records which team won. This feeds into the
    `jordan_factor` on the User model, which tracks each player's historical
    win percentage (games_won / games_played). The Jordan Factor is used by
    the team balancing algorithm to create fair teams.
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
    """Records the outcome of a completed game.

    TEACHING NOTE:
        After each game, an admin records the winner. The `winning_team`
        stores the team identifier string (e.g., "team_1"). The system then
        updates each player's Jordan Factor based on whether they were on
        the winning team.
    """

    __tablename__ = "game_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    game_id: Mapped[int] = mapped_column(Integer, ForeignKey("games.id"), unique=True, nullable=False)
    winning_team: Mapped[str] = mapped_column(String(20), nullable=False)  # "team_1", "team_2", etc.
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # --- Relationships ---
    game = relationship("Game", back_populates="result")

    def __repr__(self) -> str:
        return f"<GameResult game={self.game_id} winner={self.winning_team}>"
