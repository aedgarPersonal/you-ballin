"""
Run Stats Routes
================
Aggregated stats and leaderboards for a run.
"""

from collections import Counter

from fastapi import APIRouter, Depends
from sqlalchemy import select, func as sqlfunc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.game import Game, GameStatus, RSVP, RSVPStatus
from app.models.run import RunMembership, RunPlayerStats
from app.models.team import GameResult, TeamScore
from app.models.user import PlayerStatus, User
from app.models.vote import GameVote, VoteType
from app.schemas.stats import (
    AwardWinnerInfo,
    LeaderboardEntry,
    Leaderboards,
    PersonalStats,
    RecentGameSummary,
    RunOverview,
    RunStatsResponse,
    TeamScoreInfo,
)

router = APIRouter(prefix="/api/runs/{run_id}/stats", tags=["Stats"])


@router.get("", response_model=RunStatsResponse)
async def get_run_stats(
    run_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get aggregated stats for a run: overview, leaderboards, recent games, personal stats."""

    # --- Overview ---
    completed_count = await db.scalar(
        select(sqlfunc.count(Game.id)).where(
            Game.run_id == run_id,
            Game.status == GameStatus.COMPLETED,
        )
    )

    player_count = await db.scalar(
        select(sqlfunc.count(RunMembership.id)).where(
            RunMembership.run_id == run_id,
            RunMembership.player_status.in_([PlayerStatus.REGULAR, PlayerStatus.DROPIN]),
        )
    )

    # Average roster from accepted RSVPs on completed games
    counts_subq = (
        select(sqlfunc.count(RSVP.id).label("cnt"))
        .select_from(RSVP)
        .join(Game, RSVP.game_id == Game.id)
        .where(
            Game.run_id == run_id,
            Game.status == GameStatus.COMPLETED,
            RSVP.status == RSVPStatus.ACCEPTED,
        )
        .group_by(Game.id)
        .subquery()
    )
    avg_roster = await db.scalar(
        select(sqlfunc.avg(counts_subq.c.cnt))
    ) or 0.0

    overview = RunOverview(
        total_games=completed_count or 0,
        total_players=player_count or 0,
        avg_roster_size=round(avg_roster, 1),
    )

    # --- Leaderboards (from RunPlayerStats) ---
    stats_result = await db.execute(
        select(RunPlayerStats)
        .where(RunPlayerStats.run_id == run_id)
        .options(selectinload(RunPlayerStats.user))
    )
    all_stats = stats_result.scalars().all()

    def make_leaderboard(stats_list, key, min_games=0, top_n=5):
        filtered = [s for s in stats_list if s.games_played >= min_games]
        sorted_list = sorted(filtered, key=lambda s: getattr(s, key), reverse=True)
        return [
            LeaderboardEntry(
                player_id=s.user_id,
                full_name=s.user.full_name if s.user else "Unknown",
                avatar_url=s.user.avatar_url if s.user else None,
                value=round(float(getattr(s, key)), 3),
                rank=idx + 1,
            )
            for idx, s in enumerate(sorted_list[:top_n])
        ]

    leaderboards = Leaderboards(
        jordan_factor=make_leaderboard(all_stats, "jordan_factor", min_games=3),
        overall_rating=make_leaderboard(all_stats, "avg_overall", min_games=1),
        mvp_leaders=make_leaderboard(all_stats, "mvp_count"),
        most_games=make_leaderboard(all_stats, "games_played"),
    )

    # --- Recent Completed Games ---
    recent_games_result = await db.execute(
        select(Game)
        .where(Game.run_id == run_id, Game.status == GameStatus.COMPLETED)
        .order_by(Game.game_date.desc())
        .limit(10)
        .options(selectinload(Game.result).selectinload(GameResult.team_scores))
    )
    recent_games_rows = recent_games_result.scalars().all()

    # Get award winners for these games
    game_ids = [g.id for g in recent_games_rows]
    votes_result = await db.execute(
        select(GameVote)
        .where(GameVote.game_id.in_(game_ids))
        .options(selectinload(GameVote.nominee))
    ) if game_ids else None
    all_votes = votes_result.scalars().all() if votes_result else []

    # Group votes by game and type
    game_vote_map: dict[int, dict[str, list[GameVote]]] = {}
    for v in all_votes:
        game_vote_map.setdefault(v.game_id, {}).setdefault(v.vote_type.value, []).append(v)

    def get_winner(votes: list[GameVote]) -> AwardWinnerInfo | None:
        if not votes:
            return None
        counts = Counter(v.nominee_id for v in votes)
        winner_id, vote_count = counts.most_common(1)[0]
        winner_vote = next(v for v in votes if v.nominee_id == winner_id)
        return AwardWinnerInfo(
            player_id=winner_id,
            full_name=winner_vote.nominee.full_name if winner_vote.nominee else "Unknown",
            avatar_url=winner_vote.nominee.avatar_url if winner_vote.nominee else None,
            vote_count=vote_count,
        )

    recent_games = []
    for game in recent_games_rows:
        scores = []
        if game.result and game.result.team_scores:
            scores = [
                TeamScoreInfo(team_name=ts.team_name or ts.team, wins=ts.wins)
                for ts in sorted(game.result.team_scores, key=lambda t: t.wins, reverse=True)
            ]

        gv = game_vote_map.get(game.id, {})
        recent_games.append(
            RecentGameSummary(
                game_id=game.id,
                title=game.title,
                game_date=game.game_date,
                team_scores=scores,
                mvp=get_winner(gv.get("mvp", [])),
                shaqtin=get_winner(gv.get("shaqtin", [])),
            )
        )

    # --- Personal Stats ---
    personal = None
    user_stats_result = await db.execute(
        select(RunPlayerStats).where(
            RunPlayerStats.run_id == run_id,
            RunPlayerStats.user_id == user.id,
        )
    )
    user_stats = user_stats_result.scalar_one_or_none()

    if user_stats:
        # Calculate ranks
        jf_rank = 1 + sum(
            1 for s in all_stats
            if s.games_played >= 3 and s.jordan_factor > user_stats.jordan_factor
        )
        ovr_rank = 1 + sum(
            1 for s in all_stats
            if s.games_played >= 1 and s.avg_overall > user_stats.avg_overall
        )
        personal = PersonalStats(
            games_played=user_stats.games_played,
            games_won=user_stats.games_won,
            jordan_factor=round(user_stats.jordan_factor, 3),
            jordan_factor_rank=jf_rank,
            avg_overall=round(user_stats.avg_overall, 1),
            overall_rank=ovr_rank,
            mvp_count=user_stats.mvp_count,
            xfactor_count=user_stats.xfactor_count,
            shaqtin_count=user_stats.shaqtin_count,
        )

    return RunStatsResponse(
        overview=overview,
        leaderboards=leaderboards,
        recent_games=recent_games,
        personal=personal,
    )
