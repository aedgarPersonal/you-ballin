"""
Notification Routes
===================
In-app notification management.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.notification import Notification
from app.models.user import User
from app.schemas.notification import NotificationListResponse, NotificationResponse

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    skip: int = 0,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get the current user's notifications."""
    query = (
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(query)
    notifications = result.scalars().all()

    total_result = await db.execute(
        select(func.count()).where(Notification.user_id == user.id)
    )
    total = total_result.scalar()

    unread_result = await db.execute(
        select(func.count()).where(
            Notification.user_id == user.id, Notification.read == False  # noqa: E712
        )
    )
    unread = unread_result.scalar()

    return NotificationListResponse(
        notifications=notifications, total=total, unread_count=unread
    )


@router.post("/{notification_id}/read", response_model=NotificationResponse)
async def mark_as_read(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Mark a notification as read."""
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id, Notification.user_id == user.id
        )
    )
    notification = result.scalar_one_or_none()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    notification.read = True
    await db.flush()
    return notification


@router.post("/read-all")
async def mark_all_as_read(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Mark all notifications as read."""
    await db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.read == False)  # noqa: E712
        .values(read=True)
    )
    return {"message": "All notifications marked as read"}


@router.delete("/{notification_id}", status_code=204)
async def delete_notification(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete a single notification."""
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id, Notification.user_id == user.id
        )
    )
    notification = result.scalar_one_or_none()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    await db.delete(notification)
    await db.flush()


@router.delete("")
async def delete_all_notifications(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete all notifications for the current user."""
    await db.execute(
        delete(Notification).where(Notification.user_id == user.id)
    )
    return {"message": "All notifications deleted"}
