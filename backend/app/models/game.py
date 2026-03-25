"""
Game & RSVP Models
==================
Tracks weekly games and player responses.

TEACHING NOTE:
    The game lifecycle is:
    1. Game is auto-created by the scheduler for the upcoming week
    2. Invitations go out to REGULAR players
    3. Players RSVP (accept/decline) - deadline is 24h before game time
    4. At 8 AM game day, unclaimed spots are offered to DROPIN players
    5. Drop-in RSVPs are accepted first-come-first-served
    6. At team creation time, the algorithm builds balanced teams
    7. Teams are published to the site

    Game statuses track this lifecycle progression.
"""

import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class GameStatus(str, enum.Enum):
    """Tracks where a game is in its lifecycle."""
    SCHEDULED = "scheduled"        # Created, invites not yet sent
    INVITES_SENT = "invites_sent"  # Regular player invites sent
    DROPIN_OPEN = "dropin_open"    # Drop-in spots available
    TEAMS_SET = "teams_set"        # Teams have been created
    COMPLETED = "completed"        # Game has been played
    CANCELLED = "cancelled"
    SKIPPED = "skipped"            # Game skipped (e.g., holiday, weather)


class RSVPStatus(str, enum.Enum):
    """Player response to a game invitation."""
    PENDING = "pending"      # Invited but hasn't responded
    ACCEPTED = "accepted"    # Confirmed playing
    DECLINED = "declined"    # Can't make it
    WAITLIST = "waitlist"    # Drop-in waiting for a spot


class Game(Base):
    """A single weekly pickup game."""

    __tablename__ = "games"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[int] = mapped_column(Integer, ForeignKey("runs.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    game_date: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    location: Mapped[str] = mapped_column(String(300), nullable=False, default="TBD")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[GameStatus] = mapped_column(
        Enum(GameStatus, values_callable=lambda x: [e.value for e in x]),
        default=GameStatus.SCHEDULED, nullable=False,
    )
    roster_size: Mapped[int] = mapped_column(Integer, default=16)  # Total player slots
    num_teams: Mapped[int] = mapped_column(Integer, default=2)    # How many teams to create
    commentary: Mapped[str | None] = mapped_column(Text, nullable=True)  # Post-game recap
    odds_line: Mapped[str | None] = mapped_column(String(200), nullable=True)  # Vegas-style odds

    # --- Timestamps ---
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    # --- Relationships ---
    run = relationship("Run", back_populates="games")
    rsvps = relationship("RSVP", back_populates="game", lazy="selectin")
    teams = relationship("TeamAssignment", back_populates="game", lazy="selectin")
    result = relationship("GameResult", back_populates="game", uselist=False, lazy="selectin")

    @property
    def accepted_count(self) -> int:
        """Number of players who accepted."""
        return sum(1 for r in self.rsvps if r.status == RSVPStatus.ACCEPTED)

    @property
    def spots_remaining(self) -> int:
        """Open spots left in the roster."""
        return self.roster_size - self.accepted_count

    def __repr__(self) -> str:
        return f"<Game {self.title} on {self.game_date.date()}>"


class RSVP(Base):
    """A player's response to a game invitation.

    TEACHING NOTE:
        The composite unique constraint on (game_id, user_id) ensures
        a player can only have one RSVP per game.
    """

    __tablename__ = "rsvps"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    game_id: Mapped[int] = mapped_column(Integer, ForeignKey("games.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    status: Mapped[RSVPStatus] = mapped_column(
        Enum(RSVPStatus, values_callable=lambda x: [e.value for e in x]),
        default=RSVPStatus.PENDING, nullable=False,
    )
    responded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # --- Relationships ---
    game = relationship("Game", back_populates="rsvps")
    user = relationship("User", back_populates="rsvps")

    def __repr__(self) -> str:
        return f"<RSVP user={self.user_id} game={self.game_id} status={self.status.value}>"
