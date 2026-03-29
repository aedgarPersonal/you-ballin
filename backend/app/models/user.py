"""
User Model
==========
Represents a player/admin in the system.

TEACHING NOTE:
    This model handles both authentication data (email, password hash) and
    player profile data (height, age, mobility). The `role` field determines
    permissions, and `player_status` determines whether they're a regular
    player or a drop-in (stand-in).

    Relationships:
    - A user can RSVP to many games (one-to-many via RSVP model)
    - A user can rate many players (one-to-many via PlayerRating)
    - A user can be rated by many players (one-to-many via PlayerRating)
"""

import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Float, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class UserRole(str, enum.Enum):
    """User permission levels.

    TEACHING NOTE:
        PLAYER is the default role. SUPER_ADMIN has global access to all
        runs, games, and players. "Run admin" is NOT a user role — it's
        a relationship in the run_admins table (see RunAdmin model).
    """
    PLAYER = "player"
    ADMIN = "admin"
    SUPER_ADMIN = "super_admin"


class PlayerStatus(str, enum.Enum):
    """Determines invitation priority.

    TEACHING NOTE:
        - PENDING: just registered, waiting for admin approval
        - REGULAR: gets weekly invitations first
        - DROPIN: only gets invited if regular spots are unclaimed
        - INACTIVE: opted out or removed by admin
    """
    PENDING = "pending"
    REGULAR = "regular"
    DROPIN = "dropin"
    INACTIVE = "inactive"


class User(Base):
    """Core user model for authentication and player profiles."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)  # Null for OAuth-only users
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # --- Profile ---
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # --- Player Stats (admin-maintained) ---
    height_inches: Mapped[int | None] = mapped_column(Integer, nullable=True)
    age: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # --- System Fields ---
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, values_callable=lambda x: [e.value for e in x]),
        default=UserRole.PLAYER, nullable=False,
    )
    player_status: Mapped[PlayerStatus] = mapped_column(
        Enum(PlayerStatus, values_callable=lambda x: [e.value for e in x]),
        default=PlayerStatus.PENDING, nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    google_id: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)

    # --- Computed Ratings (cached from PlayerRating averages) ---
    avg_scoring: Mapped[float] = mapped_column(Float, default=3.0)
    avg_defense: Mapped[float] = mapped_column(Float, default=3.0)
    avg_overall: Mapped[float] = mapped_column(Float, default=3.0)
    avg_athleticism: Mapped[float] = mapped_column(Float, default=3.0)
    avg_fitness: Mapped[float] = mapped_column(Float, default=3.0)
    win_rate: Mapped[float] = mapped_column(Float, default=0.5)  # Win Rate 0.0 - 1.0
    games_played: Mapped[int] = mapped_column(Integer, default=0)
    games_won: Mapped[int] = mapped_column(Integer, default=0)
    mvp_count: Mapped[int] = mapped_column(Integer, default=0)        # Times won MVP award
    shaqtin_count: Mapped[int] = mapped_column(Integer, default=0)    # Times won Shaqtin' a Fool
    xfactor_count: Mapped[int] = mapped_column(Integer, default=0)    # Times won X Factor award

    @property
    def player_rating(self) -> int:
        """Computed 1-100 rating based on the team balancing composite score."""
        from app.services.team_balancer import compute_player_rating
        return compute_player_rating(self)

    # --- Timestamps ---
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    # --- Relationships ---
    rsvps = relationship("RSVP", back_populates="user", lazy="selectin")
    ratings_given = relationship(
        "PlayerRating", foreign_keys="PlayerRating.rater_id", back_populates="rater", lazy="selectin"
    )
    ratings_received = relationship(
        "PlayerRating", foreign_keys="PlayerRating.player_id", back_populates="player", lazy="selectin"
    )
    notifications = relationship("Notification", back_populates="user", lazy="selectin")
    run_memberships = relationship("RunMembership", back_populates="user", lazy="selectin")
    run_admin_roles = relationship("RunAdmin", back_populates="user", lazy="selectin")
    run_stats = relationship("RunPlayerStats", back_populates="user", lazy="selectin")
    push_subscriptions = relationship("PushSubscription", back_populates="user", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<User {self.username} ({self.role.value})>"
