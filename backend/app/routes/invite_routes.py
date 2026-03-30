"""
Invite Code Routes
==================
Admin-generated invite codes for closed registration.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.dependencies import get_current_user, require_run_admin
from app.database import get_db
from app.models.invite_code import InviteCode, generate_code
from app.models.run import Run
from app.models.user import User
from app.schemas.invite_code import (
    InviteCodeCreate,
    InviteCodeResponse,
    InviteCodeValidateResponse,
)

# Public routes (no auth)
public_router = APIRouter(prefix="/api/auth", tags=["Invite Codes"])

# Admin routes (run-scoped)
admin_router = APIRouter(
    prefix="/api/runs/{run_id}/admin/invite-codes",
    tags=["Invite Codes"],
)


# =============================================================================
# Public — Validate Code
# =============================================================================

@public_router.get("/validate-code", response_model=InviteCodeValidateResponse)
async def validate_invite_code(
    code: str,
    db: AsyncSession = Depends(get_db),
):
    """Validate an invite code without consuming it (no auth required)."""
    result = await db.execute(
        select(InviteCode)
        .where(InviteCode.code == code.upper().strip())
        .options(selectinload(InviteCode.run))
    )
    invite = result.scalar_one_or_none()

    if not invite:
        return InviteCodeValidateResponse(valid=False, message="Invalid invite code")

    if not invite.is_active:
        return InviteCodeValidateResponse(valid=False, message="This invite code has been deactivated")

    if invite.expires_at and invite.expires_at < datetime.utcnow():
        return InviteCodeValidateResponse(valid=False, message="This invite code has expired")

    if invite.max_uses and invite.use_count >= invite.max_uses:
        return InviteCodeValidateResponse(valid=False, message="This invite code has reached its usage limit")

    return InviteCodeValidateResponse(
        valid=True,
        run_name=invite.run.name if invite.run else None,
        run_id=invite.run_id,
        message="Valid invite code",
    )


# =============================================================================
# Admin — CRUD
# =============================================================================

@admin_router.post("", response_model=InviteCodeResponse)
async def create_invite_code(
    run_id: int,
    data: InviteCodeCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_run_admin()),
):
    """Generate a new invite code for this run."""
    # Generate unique code (retry on collision)
    for _ in range(10):
        code = generate_code()
        existing = await db.execute(select(InviteCode).where(InviteCode.code == code))
        if not existing.scalar_one_or_none():
            break
    else:
        raise HTTPException(status_code=500, detail="Failed to generate unique code")

    # Strip timezone info if present (DB column is TIMESTAMP WITHOUT TIME ZONE)
    expires = data.expires_at
    if expires and expires.tzinfo is not None:
        expires = expires.replace(tzinfo=None)

    invite = InviteCode(
        code=code,
        run_id=run_id,
        created_by_user_id=admin.id,
        max_uses=data.max_uses,
        expires_at=expires,
    )
    db.add(invite)
    await db.flush()
    return invite


@admin_router.get("", response_model=list[InviteCodeResponse])
async def list_invite_codes(
    run_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_run_admin()),
):
    """List all invite codes for this run."""
    result = await db.execute(
        select(InviteCode)
        .where(InviteCode.run_id == run_id)
        .order_by(InviteCode.created_at.desc())
    )
    return result.scalars().all()


@admin_router.patch("/{code_id}", response_model=InviteCodeResponse)
async def update_invite_code(
    run_id: int,
    code_id: int,
    data: dict,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_run_admin()),
):
    """Toggle an invite code active/inactive."""
    result = await db.execute(
        select(InviteCode).where(InviteCode.id == code_id, InviteCode.run_id == run_id)
    )
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite code not found")

    if "is_active" in data:
        invite.is_active = data["is_active"]

    await db.flush()
    return invite


@admin_router.delete("/{code_id}")
async def delete_invite_code(
    run_id: int,
    code_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_run_admin()),
):
    """Deactivate an invite code."""
    result = await db.execute(
        select(InviteCode).where(InviteCode.id == code_id, InviteCode.run_id == run_id)
    )
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite code not found")

    invite.is_active = False
    await db.flush()
    return {"message": "Invite code deactivated"}
