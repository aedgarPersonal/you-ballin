/**
 * Stats Page
 * ==========
 * Run-level stats dashboard with leaderboards, recent games, personal stats, and matchups.
 */

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import useAuthStore from "../stores/authStore";
import useRunStore from "../stores/runStore";
import { getRunStats, getMyMatchups, getPlayerMatchups, listSeasons, getSeasonDetail } from "../api/stats";
import { listPlayers } from "../api/players";
import { AvatarBadge } from "../components/AvatarPicker";

export default function StatsPage() {
  const user = useAuthStore((s) => s.user);
  const { currentRun, isRunAdmin } = useRunStore();
  const runId = currentRun?.id;
  const isAdmin = user?.role === "super_admin" || user?.role === "admin" || isRunAdmin;
  const [stats, setStats] = useState(null);
  const [matchups, setMatchups] = useState(null);
  const [loading, setLoading] = useState(true);
  const [allPlayers, setAllPlayers] = useState([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [selectedPlayerName, setSelectedPlayerName] = useState(null);
  const [showAllTeammates, setShowAllTeammates] = useState(false);
  const [showAllOpponents, setShowAllOpponents] = useState(false);
  const [seasons, setSeasons] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState(null);

  // Load seasons
  useEffect(() => {
    if (!runId) return;
    listSeasons(runId).then(({ data }) => setSeasons(data)).catch(() => {});
  }, [runId]);

  // Load player list for admin selector
  useEffect(() => {
    if (!runId || !isAdmin) return;
    listPlayers(runId).then(({ data }) => setAllPlayers(data.users || [])).catch(() => {});
  }, [runId, isAdmin]);

  useEffect(() => {
    if (!runId) { setLoading(false); return; }
    const fetchStats = async () => {
      try {
        const matchupFn = selectedPlayerId
          ? getPlayerMatchups(runId, selectedPlayerId)
          : getMyMatchups(runId);
        const [statsRes, matchupsRes] = await Promise.all([
          getRunStats(runId),
          matchupFn.catch(() => ({ data: null })),
        ]);
        setStats(statsRes.data);
        setMatchups(matchupsRes.data);
      } catch {
        setStats(null);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [runId, selectedPlayerId]);

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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {currentRun.name} — Stats
        </h1>
        {isAdmin && allPlayers.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400 uppercase tracking-wide">View as:</label>
            <select
              value={selectedPlayerId || ""}
              onChange={(e) => {
                const pid = e.target.value ? parseInt(e.target.value) : null;
                setSelectedPlayerId(pid);
                const p = allPlayers.find((pl) => pl.id === pid);
                setSelectedPlayerName(p ? p.full_name : null);
                setLoading(true);
              }}
              className="text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-lg px-3 py-1.5"
            >
              <option value="">Myself</option>
              {allPlayers.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Personal Stats Banner */}
      {stats.personal && !selectedPlayerId && (
        <div className="card mb-6 border-2 border-court-300 dark:border-court-700">
          <h2 className="text-sm font-semibold text-court-600 uppercase tracking-wide mb-3">Your Stats</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
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
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {stats.personal.shaqtin_count}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Shaqtin'</div>
            </div>
          </div>
        </div>
      )}

      {/* Your Matchups */}
      {/* Selected Player Banner */}
      {selectedPlayerId && selectedPlayerName && (
        <div className="card mb-6 border-2 border-cyan-300 dark:border-cyan-700">
          <h2 className="text-sm font-semibold text-cyan-600 uppercase tracking-wide mb-1">
            Viewing: {selectedPlayerName}
          </h2>
        </div>
      )}

      {matchups && (matchups.best_teammates.length > 0 || matchups.toughest_opponents.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="card">
            <h3 className="text-sm font-semibold text-green-600 dark:text-green-400 uppercase tracking-wide mb-3">
              Best Teammates
            </h3>
            {matchups.best_teammates.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Not enough games yet</p>
            ) : (
              <>
              <div className="space-y-2">
                {(showAllTeammates ? matchups.best_teammates : matchups.best_teammates.slice(0, 5)).map((m) => (
                  <Link
                    key={m.player_id}
                    to={`/players/${m.player_id}`}
                    className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                  >
                    {m.avatar_url ? (
                      <AvatarBadge avatarId={m.avatar_url} size="sm" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 font-bold text-xs">
                        {m.full_name.charAt(0)}
                      </div>
                    )}
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate flex-1">
                      {m.full_name}
                    </span>
                    <span className="text-sm font-bold text-green-600">{(m.win_rate * 100).toFixed(0)}%</span>
                    <span className="text-xs text-gray-400">{m.wins}W-{m.games - m.wins}L</span>
                  </Link>
                ))}
              </div>
              {matchups.best_teammates.length > 5 && (
                <button onClick={() => setShowAllTeammates(!showAllTeammates)} className="text-xs text-court-600 hover:text-court-700 mt-2 font-medium">
                  {showAllTeammates ? "Show less" : `Show all (${matchups.best_teammates.length})`}
                </button>
              )}
              </>
            )}
          </div>
          <div className="card">
            <h3 className="text-sm font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide mb-3">
              Toughest Opponents
            </h3>
            {matchups.toughest_opponents.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Not enough games yet</p>
            ) : (
              <>
              <div className="space-y-2">
                {(showAllOpponents ? matchups.toughest_opponents : matchups.toughest_opponents.slice(0, 5)).map((m) => (
                  <Link
                    key={m.player_id}
                    to={`/players/${m.player_id}`}
                    className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                  >
                    {m.avatar_url ? (
                      <AvatarBadge avatarId={m.avatar_url} size="sm" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 font-bold text-xs">
                        {m.full_name.charAt(0)}
                      </div>
                    )}
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate flex-1">
                      {m.full_name}
                    </span>
                    <span className="text-sm font-bold text-red-600">{(m.win_rate * 100).toFixed(0)}%</span>
                    <span className="text-xs text-gray-400">{m.wins}W-{m.games - m.wins}L</span>
                  </Link>
                ))}
              </div>
              {matchups.toughest_opponents.length > 5 && (
                <button onClick={() => setShowAllOpponents(!showAllOpponents)} className="text-xs text-court-600 hover:text-court-700 mt-2 font-medium">
                  {showAllOpponents ? "Show less" : `Show all (${matchups.toughest_opponents.length})`}
                </button>
              )}
              </>
            )}
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <LeaderboardCard
          title="Win Rate"
          entries={stats.leaderboards.jordan_factor}
          formatValue={(v) => `${(v * 100).toFixed(0)}%`}
        />
        <LeaderboardCard
          title="MVP Awards"
          entries={stats.leaderboards.mvp_leaders}
          formatValue={(v) => `${v}`}
          emoji="🏆"
        />
        <LeaderboardCard
          title="X Factor Awards"
          entries={stats.leaderboards.xfactor_leaders}
          formatValue={(v) => `${v}`}
          emoji="⚡"
        />
        <LeaderboardCard
          title="Shaqtin' Awards"
          entries={stats.leaderboards.shaqtin_leaders}
          formatValue={(v) => `${v}`}
          emoji="🤦"
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
                    {/* User's team + W/L */}
                    {game.my_team && (
                      <span className={`text-xs font-bold px-2 py-1 rounded ${
                        game.my_won
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : game.my_won === false
                          ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                          : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                      }`}>
                        {game.my_team} {game.my_won ? "W" : game.my_won === false ? "L" : ""}
                      </span>
                    )}
                    {/* Scores */}
                    {game.team_scores.length > 0 && (
                      <div className="flex items-center gap-2">
                        {game.team_scores.map((ts, idx) => (
                          <span key={idx} className="flex items-center gap-1">
                            {idx > 0 && <span className="text-gray-400 dark:text-gray-500 font-bold">-</span>}
                            <span className={`text-sm font-medium ${ts.team_name === game.my_team ? "text-white font-bold" : "text-gray-600 dark:text-gray-400"}`}>{ts.team_name}</span>
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

      {/* Season History */}
      {seasons.length > 0 && (
        <>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 mt-8">Past Seasons</h2>
          <div className="space-y-3">
            {seasons.map((season) => (
              <button
                key={season.id}
                onClick={async () => {
                  if (selectedSeason?.id === season.id) {
                    setSelectedSeason(null);
                    return;
                  }
                  try {
                    const { data } = await getSeasonDetail(runId, season.id);
                    setSelectedSeason(data);
                  } catch { /* ignore */ }
                }}
                className="card block w-full text-left hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">{season.label}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {season.total_games} games &middot; {season.total_players} players
                    </p>
                  </div>
                  <span className="text-xs text-gray-400">{selectedSeason?.id === season.id ? "▼" : "▶"}</span>
                </div>

                {selectedSeason?.id === season.id && (
                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                    <div className="space-y-2">
                      {selectedSeason.players.map((p, idx) => (
                        <Link
                          key={p.user_id}
                          to={`/players/${p.user_id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-3 hover:opacity-80"
                        >
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                            idx === 0 ? "bg-yellow-400 text-yellow-900" :
                            idx === 1 ? "bg-gray-300 text-gray-700" :
                            idx === 2 ? "bg-orange-300 text-orange-800" :
                            "bg-gray-100 dark:bg-gray-700 text-gray-500"
                          }`}>{idx + 1}</div>
                          {p.avatar_url && <AvatarBadge avatarId={p.avatar_url} size="sm" />}
                          <span className="text-sm font-medium flex-1 truncate">{p.full_name}</span>
                          <span className="text-sm font-bold text-court-600">{(p.jordan_factor * 100).toFixed(0)}%</span>
                          <span className="text-xs text-gray-400">{p.games_won}W-{p.games_played - p.games_won}L</span>
                          {p.mvp_count > 0 && <span className="text-xs">🏆{p.mvp_count}</span>}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </button>
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
