"""
Algorithm Configuration & Custom Metrics
=========================================
Stores admin-configurable team balancing weights and custom player metrics.

TEACHING NOTE:
    Instead of hardcoding the team balancing weights, we store them in the
    database so admins can tune them via the UI. This has two parts:

    1. AlgorithmWeight: Stores the weight (0.0-1.0) for each metric used
       in team balancing. Includes both built-in metrics (overall, offense,
       defense, win_rate/win_rate, height, age, mobility) and any custom metrics
       created by admins.

    2. CustomMetric: Defines a new metric that admins can create (e.g.,
       "shooting", "hustle", "court_vision"). Each custom metric has a name,
       scale (min/max), and a default value for new players.

    3. PlayerCustomMetric: Stores per-player values for each custom metric.
       Admins set these values just like they set height, age, and mobility.

    When the team balancer runs, it loads ALL weights from the database
    (falling back to hardcoded defaults if none exist), fetches custom
    metric values for each player, and includes everything in the composite
    score calculation.
"""

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AlgorithmWeight(Base):
    """A single weight entry for the team balancing algorithm, scoped per-run.

    TEACHING NOTE:
        Each row maps a metric name to its weight within a specific run.
        The weights don't need to sum to 1.0 — the algorithm normalizes
        them at runtime. run_id is nullable to support global defaults
        (null = fallback for runs without custom weights).
    """

    __tablename__ = "algorithm_weights"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("runs.id"), nullable=True)
    metric_name: Mapped[str] = mapped_column(String(100), nullable=False)
    weight: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    is_builtin: Mapped[bool] = mapped_column(default=True)  # Built-in vs custom metric

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("run_id", "metric_name", name="uq_run_metric_weight"),
    )

    def __repr__(self) -> str:
        return f"<AlgorithmWeight run={self.run_id} {self.metric_name}={self.weight}>"


class CustomMetric(Base):
    """A custom player metric defined by an admin, scoped per-run.

    TEACHING NOTE:
        Custom metrics let admins track anything they think matters for
        team balancing within a specific run. run_id is nullable to
        support global defaults.
    """

    __tablename__ = "custom_metrics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("runs.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    min_value: Mapped[float] = mapped_column(Float, default=1.0)
    max_value: Mapped[float] = mapped_column(Float, default=10.0)
    default_value: Mapped[float] = mapped_column(Float, default=5.0)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # Relationship to player values
    player_values = relationship("PlayerCustomMetric", back_populates="metric", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("run_id", "name", name="uq_run_custom_metric"),
    )

    def __repr__(self) -> str:
        return f"<CustomMetric run={self.run_id} {self.name} ({self.min_value}-{self.max_value})>"


class PlayerCustomMetric(Base):
    """A player's value for a custom metric.

    TEACHING NOTE:
        This is a many-to-many relationship between Users and CustomMetrics.
        Each row stores one player's value for one metric. If a player
        doesn't have a row for a metric, the metric's default_value is used.
    """

    __tablename__ = "player_custom_metrics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    metric_id: Mapped[int] = mapped_column(Integer, ForeignKey("custom_metrics.id"), nullable=False)
    value: Mapped[float] = mapped_column(Float, nullable=False)

    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    user = relationship("User")
    metric = relationship("CustomMetric", back_populates="player_values")

    __table_args__ = (
        UniqueConstraint("user_id", "metric_id", name="uq_player_metric"),
    )

    def __repr__(self) -> str:
        return f"<PlayerCustomMetric user={self.user_id} metric={self.metric_id} value={self.value}>"
