/**
 * Stats Page
 * ==========
 * Run-level stats dashboard with leaderboards, recent games, and personal stats.
 */

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import useAuthStore from "../stores/authStore";
import useRunStore from "../stores/runStore";
import { getRunStats } from "../api/stats";
import { AvatarBadge } from "../components/AvatarPicker";

export default function StatsPage() {
  const user = useAuthStore((s) => s.user);
  const { currentRun } = useRunStore();
  const runId = currentRun?.id;
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!runId) {
      setLoading(false);
      return;
    }
    const fetchStats = async () => {
      try {
        const { data } = await getRunStats(runId);
        setStats(data);
      } catch {
        setStats(null);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [runId]);

  if (!currentRun) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 text-center">
        <p className="text-gray-500 dark:text-gray-400">Please select a Run from the dropdown above.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <p className="text-gray-500 dark:text-gray-400">Loading stats...</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 text-center">
        <p className="text-gray-500 dark:text-gray-400">Unable to load stats.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
        {currentRun.name} — Stats
      </h1>

      {/* Personal Stats Banner */}
      {stats.personal && (
        <div className="card mb-6 border-2 border-court-300 dark:border-court-700">
          <h2 className="text-sm font-semibold text-court-600 uppercase tracking-wide mb-3">Your Stats</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-court-600">
                {(stats.personal.jordan_factor * 100).toFixed(0)}%
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Win Rate</div>
              <div className="text-xs text-gray-400 dark:text-gray-500">Rank #{stats.personal.jordan_factor_rank}</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {stats.personal.games_won}-{stats.personal.games_played - stats.personal.games_won}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">W-L Record</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-court-600">{stats.personal.avg_overall.toFixed(1)}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Overall Rating</div>
              <div className="text-xs text-gray-400 dark:text-gray-500">Rank #{stats.personal.overall_rank}</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">
                {stats.personal.mvp_count}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">MVPs</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {stats.personal.xfactor_count}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">X Factors</div>
            </div>
          </div>
        </div>
      )}

      {/* Run Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="card text-center">
          <div className="text-3xl font-bold text-court-600">{stats.overview.total_games}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Games Played</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-court-600">{stats.overview.total_players}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Active Players</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-court-600">{stats.overview.avg_roster_size}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Avg Roster Size</div>
        </div>
      </div>

      {/* Leaderboards */}
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Leaderboards</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <LeaderboardCard
          title="Win Rate"
          entries={stats.leaderboards.jordan_factor}
          formatValue={(v) => `${(v * 100).toFixed(0)}%`}
        />
        <LeaderboardCard
          title="Overall Rating"
          entries={stats.leaderboards.overall_rating}
          formatValue={(v) => v.toFixed(1)}
        />
        <LeaderboardCard
          title="MVP Awards"
          entries={stats.leaderboards.mvp_leaders}
          formatValue={(v) => `${v}`}
          emoji="🏆"
        />
        <LeaderboardCard
          title="Most Games"
          entries={stats.leaderboards.most_games}
          formatValue={(v) => `${v}`}
        />
      </div>

      {/* Recent Games */}
      {stats.recent_games.length > 0 && (
        <>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Recent Games</h2>
          <div className="space-y-3">
            {stats.recent_games.map((game) => (
              <Link
                key={game.game_id}
                to={`/games/${game.game_id}`}
                className="card block hover:shadow-md transition-shadow"
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">{game.title}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {new Date(game.game_date).toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    {/* Scores */}
                    {game.team_scores.length > 0 && (
                      <div className="flex items-center gap-2">
                        {game.team_scores.map((ts, idx) => (
                          <span key={idx} className="flex items-center gap-1">
                            {idx > 0 && <span className="text-gray-400 dark:text-gray-500 font-bold">-</span>}
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{ts.team_name}</span>
                            <span className="text-lg font-black text-court-600">{ts.wins}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    {/* Awards */}
                    <div className="flex items-center gap-2">
                      {game.mvp && (
                        <span className="text-sm" title={`MVP: ${game.mvp.full_name}`}>
                          🏆 {game.mvp.full_name.split(" ")[0]}
                        </span>
                      )}
                      {game.shaqtin && (
                        <span className="text-sm" title={`Shaqtin': ${game.shaqtin.full_name}`}>
                          🤦 {game.shaqtin.full_name.split(" ")[0]}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}


function LeaderboardCard({ title, entries, formatValue, emoji }) {
  const RANK_COLORS = [
    "bg-yellow-400 text-yellow-900",
    "bg-gray-300 text-gray-700 dark:bg-gray-500 dark:text-gray-100",
    "bg-orange-300 text-orange-800 dark:bg-orange-700 dark:text-orange-100",
  ];

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
        {emoji && <span className="mr-1">{emoji}</span>}{title}
      </h3>
      {entries.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 italic">Not enough data yet</p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <Link
              key={entry.player_id}
              to={`/players/${entry.player_id}`}
              className="flex items-center gap-3 hover:opacity-80 transition-opacity"
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                  RANK_COLORS[entry.rank - 1] || "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                }`}
              >
                {entry.rank}
              </div>
              {entry.avatar_url ? (
                <AvatarBadge avatarId={entry.avatar_url} size="sm" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-court-100 flex items-center justify-center text-court-600 font-bold text-xs">
                  {entry.full_name.charAt(0)}
                </div>
              )}
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate flex-1">
                {entry.full_name}
              </span>
              <span className="text-sm font-bold text-court-600">{formatValue(entry.value)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
