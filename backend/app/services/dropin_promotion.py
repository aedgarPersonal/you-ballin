"""
Drop-in Promotion Service
=========================
Handles automatic promotion of waitlisted drop-in players to accepted
when spots become available.

Supports two priority modes:
- "fifo": First-come-first-served based on responded_at timestamp
- "admin": Priority order defined by admin via RunMembership.dropin_priority
"""
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.game import Game, RSVP, RSVPStatus
from app.models.notification import NotificationType
from app.models.run import Run, RunMembership
from app.models.user import PlayerStatus, User
from app.services.notification_service import send_notification

logger = logging.getLogger(__name__)


async def promote_waitlisted_dropins(
    db: AsyncSession,
    game: Game,
    max_promote: int | None = None,
) -> list[RSVP]:
    """Promote waitlisted drop-in players to accepted, filling available spots.

    Args:
        db: Database session
        game: The game to promote waitlisted players for
        max_promote: Maximum number to promote (defaults to spots_remaining)

    Returns:
        List of promoted RSVP records
    """
    available_spots = game.spots_remaining
    if available_spots <= 0:
        return []
    spots = min(max_promote, available_spots) if max_promote is not None else available_spots

    # Get the run's priority mode
    run_result = await db.execute(select(Run).where(Run.id == game.run_id))
    run = run_result.scalar_one_or_none()
    priority_mode = run.dropin_priority_mode if run else "fifo"

    # Get all waitlisted RSVPs for this game
    waitlist_query = (
        select(RSVP)
        .where(RSVP.game_id == game.id, RSVP.status == RSVPStatus.WAITLIST)
        .options(selectinload(RSVP.user))
    )

    if priority_mode == "admin":
        # Join with RunMembership to get dropin_priority, order by priority (nulls last)
        waitlist_query = (
            waitlist_query
            .join(RunMembership, (RunMembership.user_id == RSVP.user_id) & (RunMembership.run_id == game.run_id))
            .order_by(
                RunMembership.dropin_priority.asc().nullslast(),
                RSVP.responded_at.asc(),
            )
        )
    else:
        # FIFO: order by responded_at
        waitlist_query = waitlist_query.order_by(RSVP.responded_at.asc())

    result = await db.execute(waitlist_query)
    waitlisted = list(result.scalars().all())

    promoted = []
    for rsvp in waitlisted[:spots]:
        rsvp.status = RSVPStatus.ACCEPTED
        promoted.append(rsvp)

        # Notify the player
        if rsvp.user:
            await send_notification(
                db, rsvp.user,
                NotificationType.GAME_INVITE,
                f"You're In: {game.title}",
                f"A spot opened up and you've been promoted from the waitlist for {game.title}!",
                action_url=f"/games/{game.id}",
            )

    if promoted:
        await db.flush()
        names = [r.user.full_name for r in promoted if r.user]
        logger.info(f"Promoted {len(promoted)} waitlisted players for game {game.id}: {names}")

    return promoted
