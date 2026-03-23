"""
Notification Service
====================
Sends notifications via email, SMS, and in-app.

TEACHING NOTE:
    This service abstracts the delivery mechanism. When business logic
    needs to notify a user, it calls one function here, and the service
    handles all three channels (email, SMS, in-app).

    In development, email/SMS are logged to console instead of actually
    sending. Set SMTP and Twilio credentials in .env for real delivery.
"""

import logging
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.notification import Notification, NotificationType
from app.models.user import User

logger = logging.getLogger(__name__)


async def send_notification(
    db: AsyncSession,
    user: User,
    notification_type: NotificationType,
    title: str,
    message: str,
    send_email: bool = True,
    send_sms: bool = True,
) -> Notification:
    """Send a notification to a user via all configured channels.

    TEACHING NOTE:
        The notification is always saved to the database (in-app).
        Email and SMS are attempted if credentials are configured
        and the user has the relevant contact info.

    Args:
        db: Database session.
        user: The recipient.
        notification_type: Category of notification.
        title: Short title (shown in notification list).
        message: Full message body.
        send_email: Whether to attempt email delivery.
        send_sms: Whether to attempt SMS delivery.

    Returns:
        The created Notification record.
    """
    # Always create in-app notification
    notification = Notification(
        user_id=user.id,
        type=notification_type,
        title=title,
        message=message,
    )
    db.add(notification)

    # Attempt email delivery
    if send_email and user.email:
        try:
            email_sent = await _send_email(user.email, title, message)
            notification.email_sent = email_sent
        except Exception as e:
            logger.error(f"Failed to send email to {user.email}: {e}")

    # Attempt SMS delivery
    if send_sms and user.phone:
        try:
            sms_sent = await _send_sms(user.phone, f"{title}: {message}")
            notification.sms_sent = sms_sent
        except Exception as e:
            logger.error(f"Failed to send SMS to {user.phone}: {e}")

    await db.flush()
    return notification


async def send_bulk_notification(
    db: AsyncSession,
    users: list[User],
    notification_type: NotificationType,
    title: str,
    message: str,
) -> list[Notification]:
    """Send the same notification to multiple users.

    TEACHING NOTE:
        Used for game invitations and team announcements where all
        players receive the same message.
    """
    notifications = []
    for user in users:
        notif = await send_notification(db, user, notification_type, title, message)
        notifications.append(notif)
    return notifications


# =============================================================================
# Email Delivery
# =============================================================================

async def _send_email(to_email: str, subject: str, body: str) -> bool:
    """Send an email via SMTP.

    TEACHING NOTE:
        aiosmtplib provides async SMTP so email sending doesn't block
        the event loop. In production, consider using a background task
        queue (Celery) for email delivery to avoid slowing down API
        responses.
    """
    if not settings.smtp_user or not settings.smtp_password:
        logger.info(f"[DEV] Email to {to_email}: {subject} - {body}")
        return False

    try:
        import aiosmtplib
        from email.message import EmailMessage

        msg = EmailMessage()
        msg["From"] = settings.email_from
        msg["To"] = to_email
        msg["Subject"] = f"[You Ballin] {subject}"
        msg.set_content(body)

        await aiosmtplib.send(
            msg,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_user,
            password=settings.smtp_password,
            start_tls=True,
        )
        return True
    except Exception as e:
        logger.error(f"Email send failed: {e}")
        return False


# =============================================================================
# SMS Delivery
# =============================================================================

async def _send_sms(to_phone: str, message: str) -> bool:
    """Send an SMS via Twilio.

    TEACHING NOTE:
        Twilio's Python SDK is synchronous, so we'd normally run it
        in a thread pool. For simplicity, we use it directly here.
        In production, move to Celery tasks.
    """
    if not settings.twilio_account_sid or not settings.twilio_auth_token:
        logger.info(f"[DEV] SMS to {to_phone}: {message}")
        return False

    try:
        from twilio.rest import Client

        client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
        client.messages.create(
            body=message,
            from_=settings.twilio_phone_number,
            to=to_phone,
        )
        return True
    except Exception as e:
        logger.error(f"SMS send failed: {e}")
        return False
