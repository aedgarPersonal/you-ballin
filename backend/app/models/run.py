"""
Run & Run Membership Models
============================
A Run is a recurring game series (e.g., "Wednesday Night Hoops").

TEACHING NOTE:
    The Run model introduces multi-group support. Each Run has its own:
    - Schedule (default day/time/location)
    - Membership (players can be REGULAR in one run, DROPIN in another)
    - Dues tracking
    - Per-run notification preferences
    - Per-run player stats and ratings
    - Admin team (run admins manage their run; super admin manages all)

    Key relationships:
    - Run has many Games (one-to-many)
    - Run has many RunMemberships (one-to-many, join table to Users)
    - Run has many RunAdmins (one-to-many, join table to Users)
    - Run has many RunPlayerStats (one-to-many, per-user stats within the run)
"""

import enum as stdlib_enum
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.user import PlayerStatus

# Re-import the enum so RunMembership can use it
from sqlalchemy import Enum as SAEnum


class Run(Base):
    """A recurring game series with its own schedule, members, and admins."""

    __tablename__ = "runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    default_location: Mapped[str] = mapped_column(String(300), default="TBD")
    default_game_day: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 0=Mon..6=Sun
    default_game_time: Mapped[str | None] = mapped_column(String(10), nullable=True)  # "19:00"
    default_roster_size: Mapped[int] = mapped_column(Integer, default=16)
    default_num_teams: Mapped[int] = mapped_column(Integer, default=2)
    dues_amount: Mapped[float | None] = mapped_column(Float, nullable=True)  # Cost per player
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    skill_level: Mapped[int] = mapped_column(Integer, default=5)  # 1-5 scale
    needs_players: Mapped[bool] = mapped_column(Boolean, default=False)

    # --- Drop-in Configuration ---
    # Hours before game_date to auto-open drop-in spots (None = never auto-open)
    dropin_open_hours_before: Mapped[int | None] = mapped_column(Integer, nullable=True, default=12)
    # "fifo" = first-come-first-served by RSVP time, "admin" = admin-defined priority order
    dropin_priority_mode: Mapped[str] = mapped_column(String(20), default="fifo")

    # --- Season Dates ---
    start_date: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[datetime | None] = mapped_column(Date, nullable=True)

    # --- Timestamps ---
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    # --- Relationships ---
    memberships = relationship("RunMembership", back_populates="run", lazy="selectin")
    admins = relationship("RunAdmin", back_populates="run", lazy="selectin")
    games = relationship("Game", back_populates="run", lazy="selectin")
    player_stats = relationship("RunPlayerStats", back_populates="run", lazy="selectin")

    def __repr__(self) -> str:
        return f"<Run {self.name}>"


class RunMembership(Base):
    """A player's membership in a specific Run.

    TEACHING NOTE:
        This replaces the global player_status on the User model.
        A user can be REGULAR in one run and DROPIN in another.
        Notification preferences and dues tracking are per-run.
    """

    __tablename__ = "run_memberships"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[int] = mapped_column(Integer, ForeignKey("runs.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    player_status: Mapped[PlayerStatus] = mapped_column(
        SAEnum(PlayerStatus, values_callable=lambda x: [e.value for e in x]),
        default=PlayerStatus.PENDING, nullable=False,
    )
    dues_paid: Mapped[bool] = mapped_column(Boolean, default=False)
    notify_email: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_sms: Mapped[bool] = mapped_column(Boolean, default=True)

    # Admin-defined priority for drop-in waitlist promotion (lower = higher priority)
    dropin_priority: Mapped[int] = mapped_column(Integer, default=1, server_default="1")

    # --- Timestamps ---
    joined_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # --- Relationships ---
    run = relationship("Run", back_populates="memberships")
    user = relationship("User", back_populates="run_memberships")

    __table_args__ = (
        UniqueConstraint("run_id", "user_id", name="uq_run_user"),
    )

    def __repr__(self) -> str:
        return f"<RunMembership run={self.run_id} user={self.user_id} status={self.player_status.value}>"


class RunAdmin(Base):
    """Designates a user as an admin for a specific Run.

    TEACHING NOTE:
        Run admins can manage games, players, teams, and results within
        their run. Super admins (UserRole.SUPER_ADMIN) automatically have
        access to all runs without needing a RunAdmin row.
    """

    __tablename__ = "run_admins"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[int] = mapped_column(Integer, ForeignKey("runs.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)

    # --- Timestamps ---
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # --- Relationships ---
    run = relationship("Run", back_populates="admins")
    user = relationship("User", back_populates="run_admin_roles")

    __table_args__ = (
        UniqueConstraint("run_id", "user_id", name="uq_run_admin"),
    )

    def __repr__(self) -> str:
        return f"<RunAdmin run={self.run_id} user={self.user_id}>"


class RunPlayerStats(Base):
    """Per-run player statistics.

    TEACHING NOTE:
        Stats are tracked per-run because different runs are independent.
        A player's win rate in "Wednesday Night Hoops" may differ
        from "Sunday League". Global aggregates on the User model are
        updated as a cached convenience for cross-run views.
    """

    __tablename__ = "run_player_stats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[int] = mapped_column(Integer, ForeignKey("runs.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)

    # --- Game Stats ---
    games_played: Mapped[int] = mapped_column(Integer, default=0)
    games_won: Mapped[int] = mapped_column(Integer, default=0)
    jordan_factor: Mapped[float] = mapped_column(Float, default=0.5)

    # --- Cached Rating Averages ---
    avg_offense: Mapped[float] = mapped_column(Float, default=3.0)
    avg_defense: Mapped[float] = mapped_column(Float, default=3.0)
    avg_overall: Mapped[float] = mapped_column(Float, default=3.0)

    # --- Award Counts ---
    mvp_count: Mapped[int] = mapped_column(Integer, default=0)
    shaqtin_count: Mapped[int] = mapped_column(Integer, default=0)
    xfactor_count: Mapped[int] = mapped_column(Integer, default=0)

    # --- Relationships ---
    run = relationship("Run", back_populates="player_stats")
    user = relationship("User", back_populates="run_stats")

    __table_args__ = (
        UniqueConstraint("run_id", "user_id", name="uq_run_player_stats"),
    )

    def __repr__(self) -> str:
        return f"<RunPlayerStats run={self.run_id} user={self.user_id} GP={self.games_played}>"


class SuggestionStatus(str, stdlib_enum.Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"


class PlayerSuggestion(Base):
    """A suggestion from one run's admin to add a player to another run."""

    __tablename__ = "player_suggestions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[int] = mapped_column(Integer, ForeignKey("runs.id"), nullable=False)
    suggested_user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    suggested_by_user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    message: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[SuggestionStatus] = mapped_column(
        SAEnum(SuggestionStatus, values_callable=lambda x: [e.value for e in x]),
        default=SuggestionStatus.PENDING, nullable=False,
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    resolved_by_user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)

    # --- Timestamps ---
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # --- Relationships ---
    run = relationship("Run")
    suggested_user = relationship("User", foreign_keys=[suggested_user_id])
    suggested_by = relationship("User", foreign_keys=[suggested_by_user_id])
    resolved_by = relationship("User", foreign_keys=[resolved_by_user_id])

    def __repr__(self) -> str:
        return f"<PlayerSuggestion run={self.run_id} player={self.suggested_user_id} status={self.status.value}>"
