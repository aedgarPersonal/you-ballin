"""
Algorithm Configuration Schemas
================================
Request/response shapes for weight management and custom metrics.
"""

from datetime import datetime

from pydantic import BaseModel, Field


# =============================================================================
# Algorithm Weights
# =============================================================================

class WeightEntry(BaseModel):
    """A single metric weight."""
    metric_name: str
    weight: float = Field(ge=0.0, le=1.0)
    is_builtin: bool = True


class WeightsResponse(BaseModel):
    """All algorithm weights, returned as a list for the slider UI."""
    weights: list[WeightEntry]
    total_weight: float  # Sum of all weights (for normalization display)


class WeightsUpdate(BaseModel):
    """Batch update of algorithm weights from the slider UI.

    TEACHING NOTE:
        The frontend sends all weights at once when the admin saves.
        This makes it easy to ensure consistency — the admin sees all
        sliders at once and saves them as a set.
    """
    weights: list[WeightEntry]


# =============================================================================
# Custom Metrics
# =============================================================================

class CustomMetricCreate(BaseModel):
    """Data to create a new custom metric."""
    name: str = Field(min_length=1, max_length=100, pattern=r"^[a-z][a-z0-9_]*$")
    display_name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    min_value: float = Field(default=1.0)
    max_value: float = Field(default=10.0)
    default_value: float = Field(default=5.0)


class CustomMetricUpdate(BaseModel):
    """Updateable custom metric fields."""
    display_name: str | None = None
    description: str | None = None
    min_value: float | None = None
    max_value: float | None = None
    default_value: float | None = None


class CustomMetricResponse(BaseModel):
    """A custom metric definition."""
    id: int
    name: str
    display_name: str
    description: str | None
    min_value: float
    max_value: float
    default_value: float
    created_at: datetime

    model_config = {"from_attributes": True}


# =============================================================================
# Player Custom Metric Values
# =============================================================================

class PlayerMetricValue(BaseModel):
    """A single player's value for a custom metric."""
    metric_id: int
    metric_name: str
    display_name: str
    value: float
    min_value: float
    max_value: float


class PlayerMetricsResponse(BaseModel):
    """All custom metric values for a player."""
    user_id: int
    metrics: list[PlayerMetricValue]


class PlayerMetricUpdate(BaseModel):
    """Update a player's value for a custom metric."""
    metric_id: int
    value: float


class BulkPlayerMetricsResponse(BaseModel):
    """All custom metric values for all players in a run, keyed by user_id."""
    metrics_by_player: dict[int, list[PlayerMetricValue]]
