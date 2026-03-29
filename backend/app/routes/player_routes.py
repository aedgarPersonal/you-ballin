"""
Player Routes
=============
Player profiles, listings, and self-management.

Two routers are exported:
- router: global player endpoints (/api/players)
- run_players_router: run-scoped player listing (/api/runs/{run_id}/players)
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.run import RunAdmin, RunMembership
from app.models.user import PlayerStatus, User, UserRole
from app.schemas.user import UserListResponse, UserResponse, UserUpdate

router = APIRouter(prefix="/api/players", tags=["Players"])
run_players_router = APIRouter(prefix="/api/runs/{run_id}/players", tags=["Run Players"])

REDACTED_FIELDS = ("dropin_priority",)


async def _is_admin_for_run(user: User, run_id: int, db: AsyncSession) -> bool:
    """Check if user is super_admin/admin or a run admin."""
    if user.role in (UserRole.SUPER_ADMIN, UserRole.ADMIN):
        return True
    result = await db.execute(
        select(RunAdmin.id).where(RunAdmin.run_id == run_id, RunAdmin.user_id == user.id)
    )
    return result.scalar_one_or_none() is not None


def _redact_user(user_response: dict, hide_rating: bool = False) -> dict:
    """Remove admin-only fields from a user response dict."""
    for field in REDACTED_FIELDS:
        user_response[field] = None
    if hide_rating:
        user_response["player_rating"] = None
    return user_response


# =============================================================================
# Run-Scoped Player Listing
# =============================================================================

@run_players_router.get("")
async def list_run_players(
    run_id: int,
    search: str | None = None,
    include_inactive: bool = False,
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all approved players in a specific run."""
    statuses = [PlayerStatus.REGULAR, PlayerStatus.DROPIN]
    if include_inactive:
        statuses.append(PlayerStatus.INACTIVE)

    base_where = [RunMembership.run_id == run_id, RunMembership.player_status.in_(statuses)]
    if search:
        base_where.append(User.full_name.ilike(f"%{search}%") | User.username.ilike(f"%{search}%"))

    count_query = (
        select(func.count())
        .select_from(User)
        .join(RunMembership, RunMembership.user_id == User.id)
        .where(*base_where)
    )
    total = (await db.execute(count_query)).scalar()

    query = (
        select(User, RunMembership)
        .join(RunMembership, RunMembership.user_id == User.id)
        .where(*base_where)
        .offset(skip).limit(limit).order_by(User.full_name)
    )
    result = await db.execute(query)
    rows = result.all()

    is_admin = await _is_admin_for_run(current_user, run_id, db)

    # Check run's show_player_rating setting
    from app.models.run import Run
    from app.models.algorithm_config import AlgorithmWeight, CustomMetric, PlayerCustomMetric
    from app.services.team_balancer import compute_player_rating_with_metrics, CustomMetricDef

    run_result = await db.execute(select(Run).where(Run.id == run_id))
    run_obj = run_result.scalar_one_or_none()
    hide_rating = not is_admin and run_obj and not run_obj.show_player_rating

    # Load run's metrics and weights for run-scoped player rating
    cm_result = await db.execute(select(CustomMetric).where(CustomMetric.run_id == run_id))
    custom_metrics_db = cm_result.scalars().all()
    cm_defs = [CustomMetricDef(name=cm.name, min_value=cm.min_value, max_value=cm.max_value, default_value=cm.default_value) for cm in custom_metrics_db]

    aw_result = await db.execute(select(AlgorithmWeight).where(AlgorithmWeight.run_id == run_id))
    weights = {aw.metric_name: aw.weight for aw in aw_result.scalars().all()}

    # Load all player custom metric values in one query
    user_ids = [u.id for u, _ in rows]
    pcm_result = await db.execute(
        select(PlayerCustomMetric)
        .join(CustomMetric, PlayerCustomMetric.metric_id == CustomMetric.id)
        .where(PlayerCustomMetric.user_id.in_(user_ids), CustomMetric.run_id == run_id)
    )
    pcm_rows = pcm_result.scalars().all()

    # Build metric values map: {user_id: {metric_name: value}}
    pcm_map: dict[int, dict[str, float]] = {}
    cm_id_to_name = {cm.id: cm.name for cm in custom_metrics_db}
    for pcm in pcm_rows:
        metric_name = cm_id_to_name.get(pcm.metric_id)
        if metric_name:
            pcm_map.setdefault(pcm.user_id, {})[metric_name] = pcm.value

    user_dicts = []
    for user_obj, membership in rows:
        d = UserResponse.model_validate(user_obj).model_dump()
        # Override with run-scoped membership fields
        d["player_status"] = membership.player_status.value if hasattr(membership.player_status, 'value') else membership.player_status
        d["dropin_priority"] = membership.dropin_priority

        # Compute run-scoped player rating using full metrics
        if weights and cm_defs:
            player_values = pcm_map.get(user_obj.id, {})
            d["player_rating"] = compute_player_rating_with_metrics(user_obj, weights, cm_defs, player_values)

        user_dicts.append(d)

    if not is_admin:
        user_dicts = [_redact_user(d, hide_rating=hide_rating) for d in user_dicts]

    return {"users": user_dicts, "total": total}


@run_players_router.get("/{player_id}/rating-summary")
async def get_player_rating_summary(
    run_id: int,
    player_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Get a player's rating summary for a specific run.

    Returns the average ratings and game stats from RunPlayerStats.
    """
    from app.models.run import RunPlayerStats

    result = await db.execute(
        select(RunPlayerStats).where(
            RunPlayerStats.run_id == run_id,
            RunPlayerStats.user_id == player_id,
        )
    )
    stats = result.scalar_one_or_none()
    if not stats:
        return {
            "win_rate": 0.5,
            "games_played": 0,
            "games_won": 0,
            "total_ratings": 0,
        }

    return {
        "win_rate": round(stats.win_rate, 3),
        "games_played": stats.games_played,
        "games_won": stats.games_won,
        "total_ratings": 0,
    }


# =============================================================================
# Global Player Endpoints
# =============================================================================

@router.get("/me", response_model=UserResponse)
async def get_my_profile(user: User = Depends(get_current_user)):
    """Get the current user's profile."""
    return user


@router.patch("/me", response_model=UserResponse)
async def update_my_profile(
    data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update the current user's profile."""
    update_fields = data.model_dump(exclude_unset=True)

    # Check email uniqueness if changing email
    if "email" in update_fields and update_fields["email"] != user.email:
        existing = await db.execute(
            select(User).where(User.email == update_fields["email"], User.id != user.id)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Email already in use")

    # Validate position if provided
    if "position" in update_fields and update_fields["position"]:
        from app.schemas.user import VALID_POSITIONS
        parts = [p.strip() for p in update_fields["position"].split(",")]
        if len(parts) > 2:
            raise HTTPException(status_code=400, detail="Maximum 2 positions allowed")
        for p in parts:
            if p not in VALID_POSITIONS:
                raise HTTPException(status_code=400, detail=f"Invalid position: {p}. Valid: {', '.join(sorted(VALID_POSITIONS))}")
        update_fields["position"] = ",".join(parts)

    for field, value in update_fields.items():
        setattr(user, field, value)
    await db.flush()
    return user


@router.get("/{player_id}")
async def get_player(
    player_id: int,
    run_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Get a specific player's public profile. If run_id provided, includes run-scoped rating."""
    result = await db.execute(select(User).where(User.id == player_id))
    player = result.scalar_one_or_none()
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")

    d = UserResponse.model_validate(player).model_dump()

    # Compute run-scoped player rating if run_id provided
    if run_id:
        from app.models.algorithm_config import AlgorithmWeight, CustomMetric, PlayerCustomMetric
        from app.services.team_balancer import compute_player_rating_with_metrics, CustomMetricDef

        cm_result = await db.execute(select(CustomMetric).where(CustomMetric.run_id == run_id))
        custom_metrics_db = cm_result.scalars().all()
        cm_defs = [CustomMetricDef(name=cm.name, min_value=cm.min_value, max_value=cm.max_value, default_value=cm.default_value) for cm in custom_metrics_db]

        aw_result = await db.execute(select(AlgorithmWeight).where(AlgorithmWeight.run_id == run_id))
        weights = {aw.metric_name: aw.weight for aw in aw_result.scalars().all()}

        cm_id_to_name = {cm.id: cm.name for cm in custom_metrics_db}
        pcm_result = await db.execute(
            select(PlayerCustomMetric)
            .join(CustomMetric, PlayerCustomMetric.metric_id == CustomMetric.id)
            .where(PlayerCustomMetric.user_id == player_id, CustomMetric.run_id == run_id)
        )
        player_values = {}
        for pcm in pcm_result.scalars().all():
            name = cm_id_to_name.get(pcm.metric_id)
            if name:
                player_values[name] = pcm.value

        if weights and cm_defs:
            d["player_rating"] = compute_player_rating_with_metrics(player, weights, cm_defs, player_values)

    return d
