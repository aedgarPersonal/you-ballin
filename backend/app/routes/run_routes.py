"""
Run Management Routes
=====================
CRUD operations for runs, memberships, admins, and player stats.

Endpoints:
    POST   /api/runs                              - Super admin creates a run
    GET    /api/runs                              - List user's runs (super admin sees all)
    GET    /api/runs/{run_id}                     - Get run details (any member)
    PATCH  /api/runs/{run_id}                     - Update run settings (run admin)
    POST   /api/runs/{run_id}/admins              - Add a run admin (super admin)
    DELETE /api/runs/{run_id}/admins/{user_id}    - Remove run admin (super admin)
    GET    /api/runs/{run_id}/admins              - List run admins (run admin)
    GET    /api/runs/{run_id}/members             - List members with dues status (run admin)
    POST   /api/runs/{run_id}/join                - Player requests to join a run
    PATCH  /api/runs/{run_id}/members/{user_id}   - Update membership (admin or self)
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.dependencies import (
    get_current_super_admin,
    get_current_user,
    require_run_admin,
    require_run_member,
)
from app.database import get_db
from app.models.run import Run, RunAdmin, RunMembership, RunPlayerStats, PlayerSuggestion, SuggestionStatus
from app.models.user import PlayerStatus, User, UserRole
from app.schemas.run import (
    PlayerSuggestionAction,
    PlayerSuggestionCreate,
    PlayerSuggestionResponse,
    RunAdminResponse,
    RunCreate,
    RunMembershipResponse,
    RunMembershipUpdate,
    RunResponse,
    RunUpdate,
)

from pydantic import BaseModel


class _RunAdminAdd(BaseModel):
    """Body for adding a run admin."""
    user_id: int

router = APIRouter(prefix="/api/runs", tags=["Runs"])


# =============================================================================
# Run CRUD
# =============================================================================

@router.post("", response_model=RunResponse, status_code=status.HTTP_201_CREATED)
async def create_run(
    data: RunCreate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_super_admin),
) -> Run:
    """Create a new run (super admin only)."""
    run = Run(**data.model_dump())
    db.add(run)
    await db.flush()
    await db.refresh(run)
    return run


@router.get("", response_model=list[RunResponse])
async def list_runs(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[RunResponse]:
    """List runs visible to the current user.

    Super admins see all runs. Regular users see runs where they hold
    a RunMembership or are a RunAdmin. Each run includes an is_admin
    flag indicating whether the user can administrate that run.
    """
    is_super = user.role == UserRole.SUPER_ADMIN

    if is_super:
        result = await db.execute(
            select(Run).order_by(Run.created_at.desc())
        )
        runs = list(result.scalars().all())
    else:
        member_subq = (
            select(RunMembership.run_id)
            .where(RunMembership.user_id == user.id)
        )
        admin_subq = (
            select(RunAdmin.run_id)
            .where(RunAdmin.user_id == user.id)
        )
        result = await db.execute(
            select(Run)
            .where(Run.id.in_(member_subq) | Run.id.in_(admin_subq))
            .order_by(Run.created_at.desc())
        )
        runs = list(result.scalars().all())

    # Determine which runs this user is an admin of
    if is_super:
        admin_run_ids = {r.id for r in runs}
    else:
        admin_result = await db.execute(
            select(RunAdmin.run_id).where(RunAdmin.user_id == user.id)
        )
        admin_run_ids = set(admin_result.scalars().all())

    return [
        RunResponse.model_validate(run, from_attributes=True).model_copy(
            update={"is_admin": run.id in admin_run_ids}
        )
        for run in runs
    ]


@router.get("/needs-players", response_model=list[RunResponse])
async def list_runs_needing_players(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """List all active runs that need players."""
    result = await db.execute(
        select(Run).where(Run.is_active == True, Run.needs_players == True)
    )
    return result.scalars().all()


@router.get("/{run_id}", response_model=RunResponse)
async def get_run(
    run_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_run_member()),
) -> Run:
    """Get run details (any member, run admin, or super admin)."""
    result = await db.execute(
        select(Run)
        .where(Run.id == run_id)
        .options(
            selectinload(Run.memberships),
            selectinload(Run.admins),
        )
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


@router.patch("/{run_id}", response_model=RunResponse)
async def update_run(
    run_id: int,
    data: RunUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_run_admin()),
) -> Run:
    """Update run settings (run admin or super admin)."""
    result = await db.execute(select(Run).where(Run.id == run_id))
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    update_fields = data.model_dump(exclude_unset=True)
    for field, value in update_fields.items():
        setattr(run, field, value)

    await db.flush()
    await db.refresh(run)
    return run


# =============================================================================
# Run Admins
# =============================================================================

@router.post(
    "/{run_id}/admins",
    response_model=RunAdminResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_run_admin(
    run_id: int,
    data: _RunAdminAdd,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_run_admin()),
) -> RunAdmin:
    """Add a user as a run admin (run admin or super admin).

    Body: { "user_id": int }
    """
    user_id = data.user_id

    # Verify the run exists
    run_result = await db.execute(select(Run).where(Run.id == run_id))
    if not run_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Run not found")

    # Verify the target user exists
    user_result = await db.execute(select(User).where(User.id == user_id))
    if not user_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")

    # Check for duplicate
    existing = await db.execute(
        select(RunAdmin).where(
            RunAdmin.run_id == run_id,
            RunAdmin.user_id == user_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already an admin for this run",
        )

    run_admin = RunAdmin(run_id=run_id, user_id=user_id)
    db.add(run_admin)
    await db.flush()
    await db.refresh(run_admin)
    return run_admin


@router.delete("/{run_id}/admins/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_run_admin(
    run_id: int,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_run_admin()),
) -> None:
    """Remove a run admin (run admin or super admin)."""
    result = await db.execute(
        select(RunAdmin).where(
            RunAdmin.run_id == run_id,
            RunAdmin.user_id == user_id,
        )
    )
    run_admin = result.scalar_one_or_none()
    if not run_admin:
        raise HTTPException(status_code=404, detail="Run admin not found")

    await db.delete(run_admin)
    await db.flush()


@router.get("/{run_id}/admins", response_model=list[RunAdminResponse])
async def list_run_admins(
    run_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_run_admin()),
) -> list[RunAdmin]:
    """List all admins for a run (run admin or super admin)."""
    result = await db.execute(
        select(RunAdmin)
        .where(RunAdmin.run_id == run_id)
        .options(selectinload(RunAdmin.user))
        .order_by(RunAdmin.created_at)
    )
    return list(result.scalars().all())


# =============================================================================
# Membership
# =============================================================================

@router.get("/{run_id}/members", response_model=list[RunMembershipResponse])
async def list_run_members(
    run_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_run_admin()),
) -> list[RunMembership]:
    """List all members of a run with dues status (run admin or super admin)."""
    result = await db.execute(
        select(RunMembership)
        .where(RunMembership.run_id == run_id)
        .options(selectinload(RunMembership.user))
        .order_by(RunMembership.joined_at)
    )
    return list(result.scalars().all())


@router.post(
    "/{run_id}/join",
    response_model=RunMembershipResponse,
    status_code=status.HTTP_201_CREATED,
)
async def join_run(
    run_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RunMembership:
    """Player requests to join a run.

    Creates a RunMembership with PENDING status and initialises
    a RunPlayerStats row with default values.
    """
    # Verify the run exists and is active
    run_result = await db.execute(select(Run).where(Run.id == run_id))
    run = run_result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    if not run.is_active:
        raise HTTPException(status_code=400, detail="This run is not currently active")

    # Check for existing membership
    existing = await db.execute(
        select(RunMembership).where(
            RunMembership.run_id == run_id,
            RunMembership.user_id == user.id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You are already a member of this run",
        )

    # Create membership with PENDING status
    membership = RunMembership(
        run_id=run_id,
        user_id=user.id,
        player_status=PlayerStatus.PENDING,
    )
    db.add(membership)

    # Create default player stats entry
    stats = RunPlayerStats(
        run_id=run_id,
        user_id=user.id,
    )
    db.add(stats)

    await db.flush()
    await db.refresh(membership)
    return membership


@router.patch("/{run_id}/members/{user_id}", response_model=RunMembershipResponse)
async def update_membership(
    run_id: int,
    user_id: int,
    data: RunMembershipUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RunMembership:
    """Update a run membership.

    - Run admins (or super admins) can update player_status and dues_paid.
    - Users can update their own notify_email and notify_sms.
    """
    # Load the membership
    result = await db.execute(
        select(RunMembership).where(
            RunMembership.run_id == run_id,
            RunMembership.user_id == user_id,
        )
    )
    membership = result.scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=404, detail="Membership not found")

    update_fields = data.model_dump(exclude_unset=True)
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Determine whether the caller is a run admin / super admin
    is_admin = False
    if current_user.role == UserRole.SUPER_ADMIN:
        is_admin = True
    else:
        admin_result = await db.execute(
            select(RunAdmin).where(
                RunAdmin.run_id == run_id,
                RunAdmin.user_id == current_user.id,
            )
        )
        if admin_result.scalar_one_or_none():
            is_admin = True

    is_self = current_user.id == user_id

    # Validate field-level permissions
    admin_only_fields = {"player_status", "dues_paid"}
    self_only_fields = {"notify_email", "notify_sms"}

    requested_admin_fields = admin_only_fields & update_fields.keys()
    requested_self_fields = self_only_fields & update_fields.keys()

    if requested_admin_fields and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only run admins can update player_status and dues_paid",
        )

    if requested_self_fields and not is_self and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only update your own notification preferences",
        )

    # If not admin and not self, reject entirely
    if not is_admin and not is_self:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorised to update this membership",
        )

    for field, value in update_fields.items():
        if field == "player_status":
            # Convert string to enum
            try:
                value = PlayerStatus(value)
            except ValueError:
                raise HTTPException(
                    status_code=422,
                    detail=f"Invalid player_status: {value}",
                )
        setattr(membership, field, value)

    await db.flush()
    await db.refresh(membership)
    return membership


# =============================================================================
# Player Suggestions
# =============================================================================

@router.post("/{run_id}/suggestions", response_model=PlayerSuggestionResponse, status_code=201)
async def suggest_player(
    run_id: int,
    data: PlayerSuggestionCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Suggest a player to be added to this run (any run admin can suggest)."""
    # Verify the suggesting user is an admin of SOME run (or super admin)
    if user.role != UserRole.SUPER_ADMIN:
        admin_check = await db.execute(
            select(RunAdmin).where(RunAdmin.user_id == user.id)
        )
        if not admin_check.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Only run admins can suggest players")

    # Verify the target run exists and needs players
    run_result = await db.execute(select(Run).where(Run.id == run_id))
    run = run_result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    # Verify the suggested user exists
    user_result = await db.execute(select(User).where(User.id == data.suggested_user_id))
    suggested_user = user_result.scalar_one_or_none()
    if not suggested_user:
        raise HTTPException(status_code=404, detail="Suggested player not found")

    # Check if player is already a member of this run
    existing_membership = await db.execute(
        select(RunMembership).where(
            RunMembership.run_id == run_id,
            RunMembership.user_id == data.suggested_user_id,
        )
    )
    if existing_membership.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Player is already a member of this run")

    # Check for duplicate pending suggestion
    existing_suggestion = await db.execute(
        select(PlayerSuggestion).where(
            PlayerSuggestion.run_id == run_id,
            PlayerSuggestion.suggested_user_id == data.suggested_user_id,
            PlayerSuggestion.status == SuggestionStatus.PENDING,
        )
    )
    if existing_suggestion.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="A pending suggestion already exists for this player")

    suggestion = PlayerSuggestion(
        run_id=run_id,
        suggested_user_id=data.suggested_user_id,
        suggested_by_user_id=user.id,
        message=data.message,
    )
    db.add(suggestion)

    # Notify target run admins
    admins_result = await db.execute(
        select(RunAdmin).where(RunAdmin.run_id == run_id)
    )
    admin_ids = [a.user_id for a in admins_result.scalars().all()]
    if admin_ids:
        admins_users_result = await db.execute(select(User).where(User.id.in_(admin_ids)))
        admin_users = list(admins_users_result.scalars().all())
        from app.services.notification_service import send_bulk_notification
        from app.models.notification import NotificationType
        msg = f"{user.full_name} suggests adding {suggested_user.full_name} to {run.name}."
        if data.message:
            msg += f' Note: "{data.message}"'
        await send_bulk_notification(
            db, admin_users, NotificationType.PLAYER_SUGGESTED,
            f"Player Suggested for {run.name}", msg, run_id=run_id,
            action_url="/players",
        )

    await db.flush()
    await db.refresh(suggestion)
    # Reload with relationships
    result = await db.execute(
        select(PlayerSuggestion).where(PlayerSuggestion.id == suggestion.id)
        .options(
            selectinload(PlayerSuggestion.suggested_user),
            selectinload(PlayerSuggestion.suggested_by),
            selectinload(PlayerSuggestion.run),
        )
    )
    return result.scalar_one()


@router.get("/{run_id}/suggestions", response_model=list[PlayerSuggestionResponse])
async def list_suggestions(
    run_id: int,
    status_filter: str | None = None,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_run_admin()),
):
    """List player suggestions for this run (run admin only)."""
    query = select(PlayerSuggestion).where(PlayerSuggestion.run_id == run_id).options(
        selectinload(PlayerSuggestion.suggested_user),
        selectinload(PlayerSuggestion.suggested_by),
    )
    if status_filter:
        query = query.where(PlayerSuggestion.status == status_filter)
    else:
        query = query.where(PlayerSuggestion.status == SuggestionStatus.PENDING)
    query = query.order_by(PlayerSuggestion.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.patch("/{run_id}/suggestions/{suggestion_id}", response_model=PlayerSuggestionResponse)
async def handle_suggestion(
    run_id: int,
    suggestion_id: int,
    data: PlayerSuggestionAction,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_run_admin()),
):
    """Accept or decline a player suggestion (run admin of target run)."""
    result = await db.execute(
        select(PlayerSuggestion).where(
            PlayerSuggestion.id == suggestion_id,
            PlayerSuggestion.run_id == run_id,
        ).options(
            selectinload(PlayerSuggestion.suggested_user),
            selectinload(PlayerSuggestion.suggested_by),
            selectinload(PlayerSuggestion.run),
        )
    )
    suggestion = result.scalar_one_or_none()
    if not suggestion:
        raise HTTPException(status_code=404, detail="Suggestion not found")
    if suggestion.status != SuggestionStatus.PENDING:
        raise HTTPException(status_code=400, detail="Suggestion already resolved")

    new_status = SuggestionStatus(data.status)
    suggestion.status = new_status
    suggestion.resolved_at = datetime.utcnow()
    suggestion.resolved_by_user_id = admin.id

    from app.services.notification_service import send_notification
    from app.models.notification import NotificationType

    if new_status == SuggestionStatus.ACCEPTED:
        # Add player as DROPIN to this run
        membership = RunMembership(
            run_id=run_id,
            user_id=suggestion.suggested_user_id,
            player_status=PlayerStatus.DROPIN,
        )
        db.add(membership)

        # Create RunPlayerStats
        stats = RunPlayerStats(
            run_id=run_id,
            user_id=suggestion.suggested_user_id,
        )
        db.add(stats)

        # Notify the suggested player
        await send_notification(
            db, suggestion.suggested_user, NotificationType.SUGGESTION_ACCEPTED,
            f"You've been added to {suggestion.run.name}!",
            f"An admin suggested you for {suggestion.run.name} and you've been added as a drop-in player.",
            run_id=run_id,
            action_url="/games",
        )
        # Notify the suggesting admin
        await send_notification(
            db, suggestion.suggested_by, NotificationType.SUGGESTION_ACCEPTED,
            f"Suggestion accepted for {suggestion.run.name}",
            f"Your suggestion to add {suggestion.suggested_user.full_name} to {suggestion.run.name} was accepted!",
            run_id=run_id,
            action_url="/players",
        )
    else:
        # Notify the suggesting admin of decline
        await send_notification(
            db, suggestion.suggested_by, NotificationType.SUGGESTION_DECLINED,
            f"Suggestion declined for {suggestion.run.name}",
            f"Your suggestion to add {suggestion.suggested_user.full_name} to {suggestion.run.name} was declined.",
            run_id=run_id,
        )

    await db.flush()
    return suggestion
