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
    return await _compute_matchups(run_id, user.id, db)


@router.get("/player/{player_id}/matchups", response_model=MatchupsResponse)
async def get_player_matchups(
    run_id: int,
    player_id: int,
    _user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get matchups for a specific player (any authenticated user can view)."""
    return await _compute_matchups(run_id, player_id, db)


async def _compute_matchups(run_id: int, target_user_id: int, db: AsyncSession) -> MatchupsResponse:
    """Compute best teammates and toughest opponents for a given player."""
    completed_ids_result = await db.execute(
        select(Game.id).where(Game.run_id == run_id, Game.status == GameStatus.COMPLETED)
    )
    completed_game_ids = [row[0] for row in completed_ids_result.all()]

    if not completed_game_ids:
        return MatchupsResponse(best_teammates=[], toughest_opponents=[])

    assignments_result = await db.execute(
        select(TeamAssignment).where(TeamAssignment.game_id.in_(completed_game_ids))
    )
    all_assignments = assignments_result.scalars().all()

    game_teams: dict[int, list[tuple[int, str]]] = defaultdict(list)
    for a in all_assignments:
        game_teams[a.game_id].append((a.user_id, a.team))

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

    teammate_stats: dict[int, dict] = defaultdict(lambda: {"games": 0, "wins": 0})
    opponent_stats: dict[int, dict] = defaultdict(lambda: {"games": 0, "wins": 0})

    for game_id, players in game_teams.items():
        user_team = None
        for uid, team in players:
            if uid == target_user_id:
                user_team = team
                break
        if user_team is None:
            continue

        winning_team = game_winners.get(game_id)
        user_won = (user_team == winning_team)

        for uid, team in players:
            if uid == target_user_id:
                continue
            if team == user_team:
                teammate_stats[uid]["games"] += 1
                if user_won:
                    teammate_stats[uid]["wins"] += 1
            else:
                opponent_stats[uid]["games"] += 1
                if user_won:
                    opponent_stats[uid]["wins"] += 1

    all_player_ids = set(teammate_stats.keys()) | set(opponent_stats.keys())
    if not all_player_ids:
        return MatchupsResponse(best_teammates=[], toughest_opponents=[])

    users_result = await db.execute(
        select(User).where(User.id.in_(all_player_ids))
    )
    user_map = {u.id: u for u in users_result.scalars().all()}

    def build_entries(stats_dict, sort_reverse, min_games=1, top_n=5):
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
        entries.sort(key=lambda e: (e.win_rate, e.games), reverse=sort_reverse)
        return entries[:top_n]

    return MatchupsResponse(
        best_teammates=build_entries(teammate_stats, sort_reverse=True, top_n=50),
        toughest_opponents=build_entries(opponent_stats, sort_reverse=False, top_n=50),
    )


# =============================================================================
# Game History & Form
# =============================================================================

@router.get("/player/{player_id}/game-history")
async def get_player_game_history(
    run_id: int,
    player_id: int,
    _user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a player's game-by-game history with outcomes and awards."""
    from app.models.vote import GameVote, VoteType

    # Get all completed games where this player has a team assignment
    assignments_result = await db.execute(
        select(TeamAssignment, Game)
        .join(Game, TeamAssignment.game_id == Game.id)
        .where(
            Game.run_id == run_id,
            Game.status == GameStatus.COMPLETED,
            TeamAssignment.user_id == player_id,
        )
        .order_by(Game.game_date.desc())
    )
    rows = assignments_result.all()

    if not rows:
        return []

    game_ids = [row[1].id for row in rows]

    # Get all team assignments for these games (to find opponent team names)
    all_assignments = await db.execute(
        select(TeamAssignment).where(TeamAssignment.game_id.in_(game_ids))
    )
    game_team_names: dict[int, dict[str, str]] = {}
    for a in all_assignments.scalars().all():
        game_team_names.setdefault(a.game_id, {})[a.team] = a.team_name or a.team

    # Get results
    results_result = await db.execute(
        select(GameResult)
        .where(GameResult.game_id.in_(game_ids))
        .options(selectinload(GameResult.team_scores))
    )
    game_results: dict[int, GameResult] = {}
    for r in results_result.scalars().all():
        game_results[r.game_id] = r

    # Get awards won by this player
    votes_result = await db.execute(
        select(GameVote.game_id, GameVote.vote_type, sqlfunc.count(GameVote.id).label("cnt"))
        .where(GameVote.nominee_id == player_id, GameVote.game_id.in_(game_ids))
        .group_by(GameVote.game_id, GameVote.vote_type)
    )
    # Only include awards where this player got the most votes
    all_votes_result = await db.execute(
        select(GameVote).where(GameVote.game_id.in_(game_ids))
    )
    all_votes = all_votes_result.scalars().all()
    game_award_winners: dict[int, dict[str, int]] = {}
    for v in all_votes:
        game_award_winners.setdefault(v.game_id, {}).setdefault(v.vote_type.value, {})
        game_award_winners[v.game_id][v.vote_type.value][v.nominee_id] = \
            game_award_winners[v.game_id][v.vote_type.value].get(v.nominee_id, 0) + 1

    history = []
    for assignment, game in rows:
        result = game_results.get(game.id)
        team_names = game_team_names.get(game.id, {})
        player_team = assignment.team
        player_team_name = assignment.team_name or player_team

        # Find opponent team name
        opponent_teams = [name for tid, name in team_names.items() if tid != player_team]
        opponent_team = ", ".join(opponent_teams) if opponent_teams else "Unknown"

        # Determine win/loss and score
        won = False
        score = ""
        if result and result.team_scores:
            scores_by_team = {ts.team: ts.wins for ts in result.team_scores}
            player_wins = scores_by_team.get(player_team, 0)
            max_wins = max(scores_by_team.values())
            won = player_wins == max_wins and player_wins > 0
            sorted_scores = sorted(result.team_scores, key=lambda ts: ts.wins, reverse=True)
            score = "-".join(str(ts.wins) for ts in sorted_scores)

        # Check awards
        awards = []
        for vtype in ["mvp", "xfactor", "shaqtin"]:
            vote_counts = game_award_winners.get(game.id, {}).get(vtype, {})
            if vote_counts:
                winner_id = max(vote_counts, key=vote_counts.get)
                if winner_id == player_id:
                    awards.append(vtype)

        history.append({
            "game_id": game.id,
            "title": game.title,
            "game_date": game.game_date.isoformat(),
            "team_name": player_team_name,
            "opponent_team": opponent_team,
            "won": won,
            "score": score,
            "awards": awards,
        })

    return history


@router.get("/player/{player_id}/form")
async def get_player_form(
    run_id: int,
    player_id: int,
    _user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a player's current form: streaks, recent record, trend."""
    # Get all completed games chronologically
    assignments_result = await db.execute(
        select(TeamAssignment, Game)
        .join(Game, TeamAssignment.game_id == Game.id)
        .where(
            Game.run_id == run_id,
            Game.status == GameStatus.COMPLETED,
            TeamAssignment.user_id == player_id,
        )
        .order_by(Game.game_date.asc())
    )
    rows = assignments_result.all()

    if not rows:
        return {
            "current_streak": {"type": "none", "count": 0},
            "last_5": {"wins": 0, "losses": 0, "win_rate": 0},
            "last_10": {"wins": 0, "losses": 0, "win_rate": 0},
            "best_win_streak": 0,
            "worst_loss_streak": 0,
            "trend": "stable",
        }

    game_ids = [row[1].id for row in rows]

    # Get results
    results_result = await db.execute(
        select(GameResult)
        .where(GameResult.game_id.in_(game_ids))
        .options(selectinload(GameResult.team_scores))
    )
    game_winners: dict[int, str] = {}
    for r in results_result.scalars().all():
        if r.team_scores:
            winner = max(r.team_scores, key=lambda ts: ts.wins)
            if winner.wins > 0:
                game_winners[r.game_id] = winner.team

    # Build win/loss sequence (chronological)
    outcomes = []
    for assignment, game in rows:
        winning_team = game_winners.get(game.id)
        won = assignment.team == winning_team
        outcomes.append(won)

    total = len(outcomes)

    # Current streak
    if outcomes:
        current_type = outcomes[-1]
        current_count = 0
        for o in reversed(outcomes):
            if o == current_type:
                current_count += 1
            else:
                break
        current_streak = {"type": "win" if current_type else "loss", "count": current_count}
    else:
        current_streak = {"type": "none", "count": 0}

    # Last 5 and last 10
    def form_stats(n):
        recent = outcomes[-n:] if len(outcomes) >= n else outcomes
        w = sum(recent)
        l = len(recent) - w
        return {"wins": w, "losses": l, "win_rate": round(w / len(recent), 3) if recent else 0}

    last_5 = form_stats(5)
    last_10 = form_stats(10)

    # Best win streak and worst loss streak
    best_win = worst_loss = 0
    streak = 0
    for o in outcomes:
        if o:
            streak += 1
            best_win = max(best_win, streak)
        else:
            streak = 0
    streak = 0
    for o in outcomes:
        if not o:
            streak += 1
            worst_loss = max(worst_loss, streak)
        else:
            streak = 0

    # Trend: compare last 10 win rate to all-time
    all_time_rate = sum(outcomes) / total if total > 0 else 0.5
    recent_rate = last_10["win_rate"]
    if recent_rate > all_time_rate + 0.05:
        trend = "improving"
    elif recent_rate < all_time_rate - 0.05:
        trend = "declining"
    else:
        trend = "stable"

    return {
        "current_streak": current_streak,
        "last_5": last_5,
        "last_10": last_10,
        "best_win_streak": best_win,
        "worst_loss_streak": worst_loss,
        "trend": trend,
    }


# =============================================================================
# Season History (accessible to all authenticated users)
# =============================================================================

@router.get("/seasons")
async def list_seasons(
    run_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """List all archived seasons for this run."""
    from app.models.season import SeasonArchive
    result = await db.execute(
        select(SeasonArchive)
        .where(SeasonArchive.run_id == run_id)
        .order_by(SeasonArchive.created_at.desc())
    )
    archives = result.scalars().all()
    return [
        {
            "id": a.id,
            "label": a.label,
            "start_date": a.start_date.isoformat() if a.start_date else None,
            "end_date": a.end_date.isoformat() if a.end_date else None,
            "total_games": a.total_games,
            "total_players": a.total_players,
            "created_at": a.created_at.isoformat(),
        }
        for a in archives
    ]


@router.get("/seasons/{season_id}")
async def get_season_detail(
    run_id: int,
    season_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Get detailed stats for an archived season."""
    from app.models.season import SeasonArchive, SeasonPlayerSnapshot

    result = await db.execute(
        select(SeasonArchive)
        .where(SeasonArchive.id == season_id, SeasonArchive.run_id == run_id)
        .options(selectinload(SeasonArchive.player_snapshots).selectinload(SeasonPlayerSnapshot.user))
    )
    archive = result.scalar_one_or_none()
    if not archive:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Season not found")

    players = sorted(archive.player_snapshots, key=lambda s: s.jordan_factor, reverse=True)
    return {
        "id": archive.id,
        "label": archive.label,
        "start_date": archive.start_date.isoformat() if archive.start_date else None,
        "end_date": archive.end_date.isoformat() if archive.end_date else None,
        "total_games": archive.total_games,
        "total_players": archive.total_players,
        "players": [
            {
                "user_id": s.user_id,
                "full_name": s.user.full_name if s.user else "Unknown",
                "avatar_url": s.user.avatar_url if s.user else None,
                "games_played": s.games_played,
                "games_won": s.games_won,
                "jordan_factor": s.jordan_factor,
                "mvp_count": s.mvp_count,
                "shaqtin_count": s.shaqtin_count,
                "xfactor_count": s.xfactor_count,
            }
            for s in players
        ],
    }
