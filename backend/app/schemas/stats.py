"""
Stats Response Schemas
======================
Pydantic models for the run stats endpoint.
"""

from datetime import datetime

from pydantic import BaseModel


class RunOverview(BaseModel):
    total_games: int
    total_players: int
    avg_roster_size: float


class LeaderboardEntry(BaseModel):
    player_id: int
    full_name: str
    avatar_url: str | None
    value: float
    rank: int


class Leaderboards(BaseModel):
    jordan_factor: list[LeaderboardEntry]
    overall_rating: list[LeaderboardEntry]
    mvp_leaders: list[LeaderboardEntry]
    most_games: list[LeaderboardEntry]


class TeamScoreInfo(BaseModel):
    team_name: str
    wins: int


class AwardWinnerInfo(BaseModel):
    player_id: int
    full_name: str
    avatar_url: str | None
    vote_count: int


class RecentGameSummary(BaseModel):
    game_id: int
    title: str
    game_date: datetime
    team_scores: list[TeamScoreInfo]
    mvp: AwardWinnerInfo | None = None
    shaqtin: AwardWinnerInfo | None = None


class PersonalStats(BaseModel):
    games_played: int
    games_won: int
    jordan_factor: float
    jordan_factor_rank: int
    avg_overall: float
    overall_rank: int
    mvp_count: int
    xfactor_count: int
    shaqtin_count: int


class RunStatsResponse(BaseModel):
    overview: RunOverview
    leaderboards: Leaderboards
    recent_games: list[RecentGameSummary]
    personal: PersonalStats | None = None
