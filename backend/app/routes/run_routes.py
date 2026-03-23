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
from app.models.run import Run, RunAdmin, RunMembership, RunPlayerStats
from app.models.user import PlayerStatus, User, UserRole
from app.schemas.run import (
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
) -> list[Run]:
    """List runs visible to the current user.

    Super admins see all runs. Regular users see runs where they hold
    a RunMembership or are a RunAdmin.
    """
    if user.role == UserRole.SUPER_ADMIN:
        result = await db.execute(
            select(Run).order_by(Run.created_at.desc())
        )
        return list(result.scalars().all())

    # Runs where the user is a member
    member_subq = (
        select(RunMembership.run_id)
        .where(RunMembership.user_id == user.id)
    )
    # Runs where the user is an admin
    admin_subq = (
        select(RunAdmin.run_id)
        .where(RunAdmin.user_id == user.id)
    )

    result = await db.execute(
        select(Run)
        .where(Run.id.in_(member_subq) | Run.id.in_(admin_subq))
        .order_by(Run.created_at.desc())
    )
    return list(result.scalars().all())


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
    _admin: User = Depends(get_current_super_admin),
) -> RunAdmin:
    """Add a user as a run admin (super admin only).

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
    _admin: User = Depends(get_current_super_admin),
) -> None:
    """Remove a run admin (super admin only)."""
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
