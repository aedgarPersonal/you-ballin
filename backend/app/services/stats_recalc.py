"""
Stats Recalculation Service
============================
Recalculates run_player_stats from actual game results.
Call this after deleting games, reverting completed status, or any
operation that could make cached stats stale.
"""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.game import Game, GameStatus
from app.models.run import RunPlayerStats
from app.models.team import GameResult, TeamAssignment, TeamScore

logger = logging.getLogger(__name__)


async def recalculate_run_stats(db: AsyncSession, run_id: int):
    """Recalculate games_played, games_won, win_rate for all players in a run.

    Uses the granular per-game scores (e.g., a 3-2 result means 5 games
    played, 3 won for the winning team, 2 won for the losing team).
    Updates both RunPlayerStats and the User model's cached fields.
    """
    from app.models.user import User

    # Get all completed games with results and scores
    games_result = await db.execute(
        select(Game)
        .where(Game.run_id == run_id, Game.status == GameStatus.COMPLETED)
        .options(selectinload(Game.result).selectinload(GameResult.team_scores))
    )
    completed_games = games_result.scalars().all()

    # Build per-game score maps: game_id -> {team: wins, total: total_games}
    game_scores: dict[int, dict] = {}
    for game in completed_games:
        if game.result and game.result.team_scores:
            score_map = {}
            total = 0
            for ts in game.result.team_scores:
                score_map[ts.team] = ts.wins
                total += ts.wins
            game_scores[game.id] = {"scores": score_map, "total": total}

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

    # Compute per-player stats using granular scores
    player_stats: dict[int, dict] = {}
    for a in all_assignments:
        if a.user_id not in player_stats:
            player_stats[a.user_id] = {"played": 0, "won": 0}

        gs = game_scores.get(a.game_id)
        if gs:
            # Add total games in session (e.g., 5 for a 3-2 result)
            player_stats[a.user_id]["played"] += gs["total"]
            # Add this player's team wins (e.g., 3 if on winning team, 2 if on losing)
            player_stats[a.user_id]["won"] += gs["scores"].get(a.team, 0)

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
