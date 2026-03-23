"""
Notification Service
====================
Sends notifications via email, SMS, and in-app.

TEACHING NOTE:
    This service abstracts the delivery mechanism. When business logic
    needs to notify a user, it calls one function here, and the service
    handles all three channels (email, SMS, in-app).

    When a run_id is provided, per-run notification preferences from
    RunMembership are checked (notify_email, notify_sms) and override
    the default send_email / send_sms flags.

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
    run_id: int | None = None,
) -> Notification:
    """Send a notification to a user via all configured channels.

    TEACHING NOTE:
        The notification is always saved to the database (in-app).
        Email and SMS are attempted if credentials are configured
        and the user has the relevant contact info.

        When run_id is provided, per-run notification preferences
        from RunMembership are checked and used to override the
        default send_email / send_sms flags.

    Args:
        db: Database session.
        user: The recipient.
        notification_type: Category of notification.
        title: Short title (shown in notification list).
        message: Full message body.
        send_email: Whether to attempt email delivery.
        send_sms: Whether to attempt SMS delivery.
        run_id: Optional run ID to associate with this notification
                and to look up per-run notification preferences.

    Returns:
        The created Notification record.
    """
    # Check per-run notification preferences if run_id is provided
    if run_id:
        from app.models.run import RunMembership

        membership_result = await db.execute(
            select(RunMembership).where(
                RunMembership.run_id == run_id,
                RunMembership.user_id == user.id,
            )
        )
        membership = membership_result.scalar_one_or_none()
        if membership:
            send_email = membership.notify_email
            send_sms = membership.notify_sms

    # Always create in-app notification
    notification = Notification(
        user_id=user.id,
        run_id=run_id,
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
    run_id: int | None = None,
) -> list[Notification]:
    """Send the same notification to multiple users.

    TEACHING NOTE:
        Used for game invitations and team announcements where all
        players receive the same message. When run_id is provided,
        each user's per-run notification preferences are respected.
    """
    notifications = []
    for user in users:
        notif = await send_notification(
            db, user, notification_type, title, message, run_id=run_id,
        )
        notifications.append(notif)
    return notifications


# =============================================================================
# Email Delivery
# =============================================================================

async def _send_email(to_email: str, subject: str, body: str) -> bool:
    """Send an email via Resend (preferred) or SMTP (fallback)."""
    # Try Resend first
    if settings.resend_api_key:
        try:
            import resend
            resend.api_key = settings.resend_api_key
            resend.Emails.send({
                "from": settings.email_from,
                "to": [to_email],
                "subject": f"[You Ballin] {subject}",
                "text": body,
            })
            return True
        except Exception as e:
            logger.error(f"Resend email failed: {e}")
            return False

    # Fallback to SMTP
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
