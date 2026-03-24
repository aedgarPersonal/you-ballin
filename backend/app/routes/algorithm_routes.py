"""
Algorithm Configuration Routes
===============================
Run-scoped admin endpoints for managing team balancing weights and custom metrics.

TEACHING NOTE:
    This module provides three groups of endpoints, all scoped to a specific run:

    1. WEIGHTS: Get/update the weights used by the team balancing algorithm.
       Admins use a slider UI to adjust how much each factor matters.

    2. CUSTOM METRICS: CRUD operations for admin-defined player metrics.
       When a metric is created, a weight entry is automatically added.

    3. PLAYER METRICS: Get/set custom metric values for individual players.

    The weights are loaded by the team balancer at runtime via
    `get_active_weights()`, which falls back to hardcoded defaults
    if no database entries exist for the run.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user, require_run_admin
from app.database import get_db
from app.models.algorithm_config import AlgorithmWeight, CustomMetric, PlayerCustomMetric
from app.models.user import User
from app.schemas.algorithm import (
    CustomMetricCreate,
    CustomMetricResponse,
    CustomMetricUpdate,
    PlayerMetricUpdate,
    PlayerMetricsResponse,
    PlayerMetricValue,
    WeightEntry,
    WeightsResponse,
    WeightsUpdate,
)

router = APIRouter(prefix="/api/runs/{run_id}/algorithm", tags=["Algorithm Config"])

# Default weights used when no database entries exist
DEFAULT_WEIGHTS = {
    "overall": 0.35,
    "jordan_factor": 0.20,
    "offense": 0.15,
    "defense": 0.15,
    "height": 0.05,
    "age": 0.05,
    "mobility": 0.05,
}

BUILTIN_METRIC_LABELS = {
    "overall": "Overall Rating",
    "jordan_factor": "Win Rate",
    "offense": "Offense Rating",
    "defense": "Defense Rating",
    "height": "Height",
    "age": "Age",
    "mobility": "Mobility",
}


# =============================================================================
# Weight Management
# =============================================================================

@router.get("/weights", response_model=WeightsResponse)
async def get_weights(
    run_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_run_admin()),
):
    """Get all algorithm weights for this run (built-in and custom).

    TEACHING NOTE:
        If no weights exist in the database for this run yet, we seed them
        from the hardcoded defaults. This means the first time an admin
        visits the weights page for a run, they see the defaults and can
        start adjusting from there.
    """
    result = await db.execute(
        select(AlgorithmWeight)
        .where(AlgorithmWeight.run_id == run_id)
        .order_by(AlgorithmWeight.is_builtin.desc(), AlgorithmWeight.metric_name)
    )
    weights = result.scalars().all()

    # Seed defaults if empty for this run
    if not weights:
        for name, weight in DEFAULT_WEIGHTS.items():
            entry = AlgorithmWeight(run_id=run_id, metric_name=name, weight=weight, is_builtin=True)
            db.add(entry)
        await db.flush()
        result = await db.execute(
            select(AlgorithmWeight)
            .where(AlgorithmWeight.run_id == run_id)
            .order_by(AlgorithmWeight.is_builtin.desc(), AlgorithmWeight.metric_name)
        )
        weights = result.scalars().all()

    entries = [
        WeightEntry(metric_name=w.metric_name, weight=w.weight, is_builtin=w.is_builtin)
        for w in weights
    ]
    total = sum(e.weight for e in entries)

    return WeightsResponse(weights=entries, total_weight=total)


@router.put("/weights", response_model=WeightsResponse)
async def update_weights(
    run_id: int,
    data: WeightsUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_run_admin()),
):
    """Update all algorithm weights at once for this run.

    TEACHING NOTE:
        The frontend sends every weight in one batch. For each entry,
        we find-or-create the database row scoped to this run and update
        the weight value. Weights don't need to sum to 1.0 -- the team
        balancer normalizes them at runtime so admins can think in
        relative terms.
    """
    for entry in data.weights:
        result = await db.execute(
            select(AlgorithmWeight).where(
                AlgorithmWeight.run_id == run_id,
                AlgorithmWeight.metric_name == entry.metric_name,
            )
        )
        weight = result.scalar_one_or_none()
        if weight:
            weight.weight = entry.weight
        else:
            db.add(AlgorithmWeight(
                run_id=run_id,
                metric_name=entry.metric_name,
                weight=entry.weight,
                is_builtin=entry.is_builtin,
            ))
    await db.flush()

    return await get_weights(run_id=run_id, db=db, _admin=_admin)


# =============================================================================
# Custom Metrics CRUD
# =============================================================================

@router.get("/metrics", response_model=list[CustomMetricResponse])
async def list_custom_metrics(
    run_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_run_admin()),
):
    """List all custom metrics for this run."""
    result = await db.execute(
        select(CustomMetric)
        .where(CustomMetric.run_id == run_id)
        .order_by(CustomMetric.name)
    )
    return result.scalars().all()


@router.post("/metrics", response_model=CustomMetricResponse, status_code=status.HTTP_201_CREATED)
async def create_custom_metric(
    run_id: int,
    data: CustomMetricCreate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_run_admin()),
):
    """Create a new custom metric for this run.

    TEACHING NOTE:
        When a custom metric is created, two things happen:
        1. The CustomMetric definition is saved with run_id
        2. An AlgorithmWeight entry is created with weight=0.0 and run_id

        The weight starts at 0 so the new metric doesn't affect team
        balancing until the admin explicitly sets a weight for it via
        the sliders.
    """
    # Check for duplicate name within this run
    existing = await db.execute(
        select(CustomMetric).where(
            CustomMetric.run_id == run_id,
            CustomMetric.name == data.name,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Metric '{data.name}' already exists in this run")

    # Check name doesn't collide with built-in metrics
    if data.name in DEFAULT_WEIGHTS:
        raise HTTPException(status_code=409, detail=f"'{data.name}' is a built-in metric name")

    if data.min_value >= data.max_value:
        raise HTTPException(status_code=400, detail="min_value must be less than max_value")

    metric = CustomMetric(run_id=run_id, **data.model_dump())
    db.add(metric)

    # Auto-create weight entry for this run
    db.add(AlgorithmWeight(run_id=run_id, metric_name=data.name, weight=0.0, is_builtin=False))

    await db.flush()
    return metric


@router.patch("/metrics/{metric_id}", response_model=CustomMetricResponse)
async def update_custom_metric(
    run_id: int,
    metric_id: int,
    data: CustomMetricUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_run_admin()),
):
    """Update a custom metric definition within this run."""
    result = await db.execute(
        select(CustomMetric).where(
            CustomMetric.id == metric_id,
            CustomMetric.run_id == run_id,
        )
    )
    metric = result.scalar_one_or_none()
    if not metric:
        raise HTTPException(status_code=404, detail="Metric not found in this run")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(metric, field, value)
    await db.flush()
    return metric


@router.delete("/metrics/{metric_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_custom_metric(
    run_id: int,
    metric_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_run_admin()),
):
    """Delete a custom metric and its weight entry within this run.

    TEACHING NOTE:
        Cascading delete removes all PlayerCustomMetric values for this
        metric (configured via cascade="all, delete-orphan" on the
        relationship). The AlgorithmWeight entry is deleted manually.
    """
    result = await db.execute(
        select(CustomMetric).where(
            CustomMetric.id == metric_id,
            CustomMetric.run_id == run_id,
        )
    )
    metric = result.scalar_one_or_none()
    if not metric:
        raise HTTPException(status_code=404, detail="Metric not found in this run")

    # Delete the weight entry for this run
    weight_result = await db.execute(
        select(AlgorithmWeight).where(
            AlgorithmWeight.run_id == run_id,
            AlgorithmWeight.metric_name == metric.name,
        )
    )
    weight = weight_result.scalar_one_or_none()
    if weight:
        await db.delete(weight)

    await db.delete(metric)
    await db.flush()


# =============================================================================
# Player Custom Metric Values
# =============================================================================

@router.get("/players/{user_id}/metrics", response_model=PlayerMetricsResponse)
async def get_player_metrics(
    run_id: int,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_run_admin()),
):
    """Get all custom metric values for a player within this run.

    TEACHING NOTE:
        Returns every custom metric for this run with the player's value
        (or the metric's default if no value has been set). This powers
        the admin player edit form.
    """
    # Verify player exists
    player = await db.execute(select(User).where(User.id == user_id))
    if not player.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Player not found")

    # Get all custom metrics for this run
    metrics_result = await db.execute(
        select(CustomMetric)
        .where(CustomMetric.run_id == run_id)
        .order_by(CustomMetric.name)
    )
    metrics = metrics_result.scalars().all()

    # Get player's values
    values_result = await db.execute(
        select(PlayerCustomMetric).where(PlayerCustomMetric.user_id == user_id)
    )
    values = {v.metric_id: v.value for v in values_result.scalars().all()}

    return PlayerMetricsResponse(
        user_id=user_id,
        metrics=[
            PlayerMetricValue(
                metric_id=m.id,
                metric_name=m.name,
                display_name=m.display_name,
                value=values.get(m.id, m.default_value),
                min_value=m.min_value,
                max_value=m.max_value,
            )
            for m in metrics
        ],
    )


@router.put("/players/{user_id}/metrics", response_model=PlayerMetricsResponse)
async def update_player_metrics(
    run_id: int,
    user_id: int,
    updates: list[PlayerMetricUpdate],
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_run_admin()),
):
    """Update a player's custom metric values (batch) within this run.

    TEACHING NOTE:
        Uses upsert logic -- if a value exists, update it; otherwise
        create it. This lets the admin set all values at once from
        the player edit form.
    """
    player_result = await db.execute(select(User).where(User.id == user_id))
    if not player_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Player not found")

    for update in updates:
        result = await db.execute(
            select(PlayerCustomMetric).where(
                PlayerCustomMetric.user_id == user_id,
                PlayerCustomMetric.metric_id == update.metric_id,
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            existing.value = update.value
        else:
            db.add(PlayerCustomMetric(
                user_id=user_id,
                metric_id=update.metric_id,
                value=update.value,
            ))

    await db.flush()
    return await get_player_metrics(run_id=run_id, user_id=user_id, db=db, _admin=_admin)
