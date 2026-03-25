"""
Push Subscription Routes
========================
Endpoints for Web Push notification subscription management.
"""

from fastapi import APIRouter, Depends
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.auth.dependencies import get_current_user
from app.config import settings
from app.database import get_db
from app.models.push_subscription import PushSubscription
from app.models.user import User
from app.schemas.push_subscription import (
    PushSubscriptionCreate,
    PushSubscriptionResponse,
    VapidPublicKeyResponse,
)

router = APIRouter(prefix="/api/push", tags=["Push"])


@router.get("/vapid-key", response_model=VapidPublicKeyResponse)
async def get_vapid_key():
    """Get the VAPID public key for subscribing to push notifications."""
    return VapidPublicKeyResponse(public_key=settings.vapid_public_key)


@router.post("/subscribe", response_model=PushSubscriptionResponse)
async def subscribe(
    data: PushSubscriptionCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Subscribe this device to push notifications. Upserts if endpoint already exists."""
    stmt = pg_insert(PushSubscription).values(
        user_id=user.id,
        endpoint=data.endpoint,
        p256dh_key=data.p256dh_key,
        auth_key=data.auth_key,
        user_agent=data.user_agent,
    ).on_conflict_do_update(
        constraint="uq_push_user_endpoint",
        set_={
            "p256dh_key": data.p256dh_key,
            "auth_key": data.auth_key,
            "user_agent": data.user_agent,
        },
    ).returning(PushSubscription)

    result = await db.execute(stmt)
    sub = result.scalar_one()
    await db.commit()
    return sub


@router.post("/test")
async def test_push(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send a test push notification to the current user's devices."""
    import asyncio
    import json as jsonlib

    subs_result = await db.execute(
        select(PushSubscription).where(PushSubscription.user_id == user.id)
    )
    subs = subs_result.scalars().all()

    if not subs:
        return {"error": "No push subscriptions found", "vapid_private_key_set": bool(settings.vapid_private_key)}

    results = []
    for sub in subs:
        try:
            from pywebpush import webpush, WebPushException

            payload = jsonlib.dumps({
                "title": "Test Notification",
                "body": "Push notifications are working!",
                "url": "/",
            })

            await asyncio.to_thread(
                webpush,
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh_key, "auth": sub.auth_key},
                },
                data=payload,
                vapid_private_key=settings.vapid_private_key,
                vapid_claims={"sub": settings.vapid_claim_email},
            )
            results.append({"endpoint": sub.endpoint[:50], "status": "sent"})
        except Exception as e:
            results.append({"endpoint": sub.endpoint[:50], "status": "failed", "error": str(e)})

    return {"subscriptions": len(subs), "results": results, "vapid_key_len": len(settings.vapid_private_key)}


@router.post("/unsubscribe")
async def unsubscribe(
    data: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Unsubscribe this device from push notifications."""
    endpoint = data.get("endpoint", "")
    await db.execute(
        delete(PushSubscription).where(
            PushSubscription.user_id == user.id,
            PushSubscription.endpoint == endpoint,
        )
    )
    await db.commit()
    return {"message": "Unsubscribed"}
