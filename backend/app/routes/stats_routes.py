"""
Run Stats Routes
================
Aggregated stats and leaderboards for a run.
"""

from collections import Counter, defaultdict

from fastapi import APIRouter, Depends
from sqlalchemy import select, func as sqlfunc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.game import Game, GameStatus, RSVP, RSVPStatus
from app.models.run import RunMembership, RunPlayerStats
from app.models.team import GameResult, TeamAssignment, TeamScore
from app.models.user import PlayerStatus, User
from app.models.vote import GameVote, VoteType
from app.schemas.stats import (
    AwardWinnerInfo,
    LeaderboardEntry,
    Leaderboards,
    MatchupEntry,
    MatchupsResponse,
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
        mvp_leaders=make_leaderboard(all_stats, "mvp_count"),
        xfactor_leaders=make_leaderboard(all_stats, "xfactor_count"),
        shaqtin_leaders=make_leaderboard(all_stats, "shaqtin_count"),
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
        jf_rank = 1 + sum(
            1 for s in all_stats
            if s.games_played >= 3 and s.jordan_factor > user_stats.jordan_factor
        )
        personal = PersonalStats(
            games_played=user_stats.games_played,
            games_won=user_stats.games_won,
            jordan_factor=round(user_stats.jordan_factor, 3),
            jordan_factor_rank=jf_rank,
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


@router.get("/my-matchups", response_model=MatchupsResponse)
async def get_my_matchups(
    run_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the current user's best teammates and toughest opponents."""

    # Get all completed game IDs in this run
    completed_ids_result = await db.execute(
        select(Game.id).where(Game.run_id == run_id, Game.status == GameStatus.COMPLETED)
    )
    completed_game_ids = [row[0] for row in completed_ids_result.all()]

    if not completed_game_ids:
        return MatchupsResponse(best_teammates=[], toughest_opponents=[])

    # Get all team assignments for completed games
    assignments_result = await db.execute(
        select(TeamAssignment).where(TeamAssignment.game_id.in_(completed_game_ids))
    )
    all_assignments = assignments_result.scalars().all()

    # Group assignments by game
    game_teams: dict[int, list[tuple[int, str]]] = defaultdict(list)
    for a in all_assignments:
        game_teams[a.game_id].append((a.user_id, a.team))

    # Get winning team per game
    results_result = await db.execute(
        select(GameResult)
        .where(GameResult.game_id.in_(completed_game_ids))
        .options(selectinload(GameResult.team_scores))
    )
    game_winners: dict[int, str] = {}
    for result in results_result.scalars().all():
        if result.team_scores:
            winner = max(result.team_scores, key=lambda ts: ts.wins)
            if winner.wins > 0:
                game_winners[result.game_id] = winner.team

    # Aggregate teammate and opponent stats
    teammate_stats: dict[int, dict] = defaultdict(lambda: {"games": 0, "wins": 0})
    opponent_stats: dict[int, dict] = defaultdict(lambda: {"games": 0, "wins": 0})

    for game_id, players in game_teams.items():
        user_team = None
        for uid, team in players:
            if uid == user.id:
                user_team = team
                break
        if user_team is None:
            continue

        winning_team = game_winners.get(game_id)
        user_won = (user_team == winning_team)

        for uid, team in players:
            if uid == user.id:
                continue
            if team == user_team:
                teammate_stats[uid]["games"] += 1
                if user_won:
                    teammate_stats[uid]["wins"] += 1
            else:
                opponent_stats[uid]["games"] += 1
                if user_won:
                    opponent_stats[uid]["wins"] += 1

    # Load user names for all player IDs we need
    all_player_ids = set(teammate_stats.keys()) | set(opponent_stats.keys())
    if not all_player_ids:
        return MatchupsResponse(best_teammates=[], toughest_opponents=[])

    users_result = await db.execute(
        select(User).where(User.id.in_(all_player_ids))
    )
    user_map = {u.id: u for u in users_result.scalars().all()}

    def build_entries(stats_dict, sort_reverse, min_games=3, top_n=5):
        entries = []
        for pid, data in stats_dict.items():
            if data["games"] < min_games:
                continue
            u = user_map.get(pid)
            entries.append(MatchupEntry(
                player_id=pid,
                full_name=u.full_name if u else "Unknown",
                avatar_url=u.avatar_url if u else None,
                games=data["games"],
                wins=data["wins"],
                win_rate=round(data["wins"] / data["games"], 3),
            ))
        entries.sort(key=lambda e: e.win_rate, reverse=sort_reverse)
        return entries[:top_n]

    return MatchupsResponse(
        best_teammates=build_entries(teammate_stats, sort_reverse=True),
        toughest_opponents=build_entries(opponent_stats, sort_reverse=False),
    )
