"""
Stats Recalculation Service
============================
Recalculates run_player_stats from actual game results.
Call this after deleting games, reverting completed status, or any
operation that could make cached stats stale.
"""

import logging

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.game import Game, GameStatus
from app.models.run import RunPlayerStats
from app.models.team import GameResult, TeamAssignment, TeamScore

logger = logging.getLogger(__name__)


async def recalculate_run_stats(db: AsyncSession, run_id: int):
    """Recalculate games_played, games_won, win_rate for all players in a run.

    Computes from actual completed game results (team_assignments + team_scores).
    Updates both RunPlayerStats and the User model's cached fields.
    """
    from app.models.user import User

    # Get all completed games with results
    games_result = await db.execute(
        select(Game)
        .where(Game.run_id == run_id, Game.status == GameStatus.COMPLETED)
        .options(selectinload(Game.result).selectinload(GameResult.team_scores))
    )
    completed_games = games_result.scalars().all()

    # Build winning team map
    game_winners: dict[int, str] = {}
    for game in completed_games:
        if game.result and game.result.team_scores:
            winner = max(game.result.team_scores, key=lambda ts: ts.wins)
            if winner.wins > 0:
                game_winners[game.id] = winner.team

    # Get all team assignments for completed games
    game_ids = [g.id for g in completed_games]
    if not game_ids:
        # No completed games — zero out all stats
        all_rps = await db.execute(
            select(RunPlayerStats).where(RunPlayerStats.run_id == run_id)
        )
        for rps in all_rps.scalars().all():
            rps.games_played = 0
            rps.games_won = 0
            rps.win_rate = 0.5
            # Also update User
            user_result = await db.execute(select(User).where(User.id == rps.user_id))
            user = user_result.scalar_one_or_none()
            if user:
                user.games_played = 0
                user.games_won = 0
                user.win_rate = 0.5
        await db.flush()
        logger.info(f"Run {run_id}: zeroed stats (no completed games)")
        return

    assignments_result = await db.execute(
        select(TeamAssignment).where(TeamAssignment.game_id.in_(game_ids))
    )
    all_assignments = assignments_result.scalars().all()

    # Compute per-player stats
    player_stats: dict[int, dict] = {}
    for a in all_assignments:
        if a.user_id not in player_stats:
            player_stats[a.user_id] = {"played": 0, "won": 0}
        player_stats[a.user_id]["played"] += 1
        winning_team = game_winners.get(a.game_id)
        if a.team == winning_team:
            player_stats[a.user_id]["won"] += 1

    # Update RunPlayerStats
    all_rps = await db.execute(
        select(RunPlayerStats).where(RunPlayerStats.run_id == run_id)
    )
    for rps in all_rps.scalars().all():
        ps = player_stats.get(rps.user_id, {"played": 0, "won": 0})
        rps.games_played = ps["played"]
        rps.games_won = ps["won"]
        rps.win_rate = round(ps["won"] / ps["played"], 3) if ps["played"] > 0 else 0.5

        # Also update User cached fields
        user_result = await db.execute(select(User).where(User.id == rps.user_id))
        user = user_result.scalar_one_or_none()
        if user:
            user.games_played = ps["played"]
            user.games_won = ps["won"]
            user.win_rate = rps.win_rate

    await db.flush()
    logger.info(f"Run {run_id}: recalculated stats for {len(player_stats)} players from {len(game_ids)} completed games")
