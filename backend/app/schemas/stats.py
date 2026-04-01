"""
Stats Response Schemas
======================
Pydantic models for the run stats endpoint.
"""

from datetime import datetime

from pydantic import BaseModel


class RunOverview(BaseModel):
    total_sessions: int
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
    win_rate: list[LeaderboardEntry]
    mvp_leaders: list[LeaderboardEntry]
    xfactor_leaders: list[LeaderboardEntry]
    shaqtin_leaders: list[LeaderboardEntry]
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
    xfactor: AwardWinnerInfo | None = None
    shaqtin: AwardWinnerInfo | None = None
    my_team: str | None = None
    my_won: bool | None = None


class PersonalStats(BaseModel):
    games_played: int
    games_won: int
    win_rate: float
    win_rate_rank: int
    mvp_count: int
    xfactor_count: int
    shaqtin_count: int


class MatchupEntry(BaseModel):
    player_id: int
    full_name: str
    avatar_url: str | None
    games: int
    wins: int
    win_rate: float


class MatchupsResponse(BaseModel):
    best_teammates: list[MatchupEntry]
    toughest_opponents: list[MatchupEntry]


class RunStatsResponse(BaseModel):
    overview: RunOverview
    leaderboards: Leaderboards
    recent_games: list[RecentGameSummary]
    personal: PersonalStats | None = None
