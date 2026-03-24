/**
 * Players List Page with Leaderboard
 * ===================================
 * Browse all approved players with sortable leaderboard view.
 */

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import useRunStore from "../stores/runStore";
import useAuthStore from "../stores/authStore";
import { listPlayers } from "../api/players";
import { updatePlayerAdmin } from "../api/admin";
import { AvatarBadge } from "../components/AvatarPicker";
import toast from "react-hot-toast";

const SORT_OPTIONS = [
  { value: "name", label: "Name" },
  { value: "jordan_factor", label: "Win Rate" },
  { value: "games_won", label: "Total Wins" },
  { value: "games_played", label: "Games Played" },
  { value: "avg_overall", label: "Overall Rating" },
  { value: "mvp_count", label: "MVP Awards" },
  { value: "xfactor_count", label: "X Factor Awards" },
];

export default function PlayersPage() {
  const { currentRun } = useRunStore();
  const runId = currentRun?.id;
  const currentUser = useAuthStore((s) => s.user);
  const isAdmin = currentUser?.role === "super_admin";
  const [players, setPlayers] = useState([]);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("jordan_factor");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!runId) {
      setLoading(false);
      return;
    }
    const fetch = async () => {
      try {
        const { data } = await listPlayers(runId, { search: search || undefined });
        setPlayers(data.users);
      } catch {
        setPlayers([]);
      } finally {
        setLoading(false);
      }
    };
    const debounce = setTimeout(fetch, 300);
    return () => clearTimeout(debounce);
  }, [runId, search]);

  if (!currentRun) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 text-center">
        <p className="text-gray-500 dark:text-gray-400">Please select a Run from the dropdown above.</p>
      </div>
    );
  }

  const sortedPlayers = [...players].sort((a, b) => {
    if (sortBy === "name") return a.full_name.localeCompare(b.full_name);
    // Sort descending for numeric stats
    return (b[sortBy] || 0) - (a[sortBy] || 0);
  });

  const isRanked = sortBy !== "name";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Players</h1>
          {currentRun && <p className="text-sm text-court-600">{currentRun.name}</p>}
        </div>
        <div className="flex items-center gap-3">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-lg px-3 py-2"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Search players..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input w-48"
          />
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500 dark:text-gray-400">Loading players...</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedPlayers.map((player, idx) => (
            <Link key={player.id} to={`/players/${player.id}`} className="card hover:shadow-md transition-shadow">
              <div className="flex items-center gap-4">
                {/* Rank badge when sorted by a stat */}
                {isRanked && (
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black shrink-0 ${
                    idx === 0 ? "bg-yellow-400 text-yellow-900" :
                    idx === 1 ? "bg-gray-300 text-gray-700" :
                    idx === 2 ? "bg-orange-300 text-orange-800" :
                    "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                  }`}>
                    {idx + 1}
                  </div>
                )}
                {player.avatar_url ? (
                  <AvatarBadge avatarId={player.avatar_url} size="md" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-court-100 flex items-center justify-center text-court-600 font-bold text-lg">
                    {player.full_name.charAt(0)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">{player.full_name}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">@{player.username}</p>
                  <span className={`badge-${player.player_status} mt-1`}>
                    {player.player_status}
                  </span>
                </div>
              </div>

              {/* Award Trophies */}
              {(player.mvp_count > 0 || player.xfactor_count > 0 || player.shaqtin_count > 0) && (
                <div className="flex gap-3 mt-3 flex-wrap">
                  {player.mvp_count > 0 && (
                    <div className="flex items-center gap-1.5 bg-gradient-to-r from-yellow-50 to-yellow-100 dark:from-yellow-900/20 dark:to-yellow-900/30 border border-yellow-300 dark:border-yellow-700 rounded-lg px-3 py-1.5">
                      <span className="text-lg">🏆</span>
                      <div className="leading-tight">
                        <div className="text-sm font-bold text-yellow-800">{player.mvp_count}</div>
                        <div className="text-[10px] font-medium text-yellow-600 uppercase tracking-wider">MVP</div>
                      </div>
                    </div>
                  )}
                  {player.xfactor_count > 0 && (
                    <div className="flex items-center gap-1.5 bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-900/30 border border-blue-300 dark:border-blue-700 rounded-lg px-3 py-1.5">
                      <span className="text-lg">⚡</span>
                      <div className="leading-tight">
                        <div className="text-sm font-bold text-blue-800">{player.xfactor_count}</div>
                        <div className="text-[10px] font-medium text-blue-600 uppercase tracking-wider">X Factor</div>
                      </div>
                    </div>
                  )}
                  {player.shaqtin_count > 0 && (
                    <div className="flex items-center gap-1.5 bg-gradient-to-r from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-900/30 border border-purple-300 dark:border-purple-700 rounded-lg px-3 py-1.5">
                      <span className="text-lg">🤦</span>
                      <div className="leading-tight">
                        <div className="text-sm font-bold text-purple-800">{player.shaqtin_count}</div>
                        <div className="text-[10px] font-medium text-purple-600 uppercase tracking-wider">Shaqtin'</div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Stats Grid */}
              <div className="grid grid-cols-5 gap-2 mt-3 text-center">
                <div>
                  {isAdmin ? (
                    <input
                      type="number"
                      step="0.5"
                      min="1"
                      max="5"
                      defaultValue={player.avg_offense?.toFixed(1)}
                      onBlur={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val) && val !== player.avg_offense) {
                          updatePlayerAdmin(runId, player.id, { avg_offense: val })
                            .then(() => toast.success("Updated"))
                            .catch(() => toast.error("Failed"));
                        }
                      }}
                      onClick={(e) => e.preventDefault()}
                      className="w-full text-sm font-bold text-court-600 text-center border border-transparent hover:border-gray-300 dark:hover:border-gray-600 rounded bg-transparent focus:border-court-500 focus:outline-none"
                    />
                  ) : (
                    <div className="text-sm font-bold text-court-600">{player.avg_offense?.toFixed(1)}</div>
                  )}
                  <div className="text-xs text-gray-400 dark:text-gray-500">OFF</div>
                </div>
                <div>
                  {isAdmin ? (
                    <input
                      type="number"
                      step="0.5"
                      min="1"
                      max="5"
                      defaultValue={player.avg_defense?.toFixed(1)}
                      onBlur={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val) && val !== player.avg_defense) {
                          updatePlayerAdmin(runId, player.id, { avg_defense: val })
                            .then(() => toast.success("Updated"))
                            .catch(() => toast.error("Failed"));
                        }
                      }}
                      onClick={(e) => e.preventDefault()}
                      className="w-full text-sm font-bold text-court-600 text-center border border-transparent hover:border-gray-300 dark:hover:border-gray-600 rounded bg-transparent focus:border-court-500 focus:outline-none"
                    />
                  ) : (
                    <div className="text-sm font-bold text-court-600">{player.avg_defense?.toFixed(1)}</div>
                  )}
                  <div className="text-xs text-gray-400 dark:text-gray-500">DEF</div>
                </div>
                <div>
                  {isAdmin ? (
                    <input
                      type="number"
                      step="0.5"
                      min="1"
                      max="5"
                      defaultValue={player.avg_overall?.toFixed(1)}
                      onBlur={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val) && val !== player.avg_overall) {
                          updatePlayerAdmin(runId, player.id, { avg_overall: val })
                            .then(() => toast.success("Updated"))
                            .catch(() => toast.error("Failed"));
                        }
                      }}
                      onClick={(e) => e.preventDefault()}
                      className="w-full text-sm font-bold text-court-600 text-center border border-transparent hover:border-gray-300 dark:hover:border-gray-600 rounded bg-transparent focus:border-court-500 focus:outline-none"
                    />
                  ) : (
                    <div className="text-sm font-bold text-court-600">{player.avg_overall?.toFixed(1)}</div>
                  )}
                  <div className="text-xs text-gray-400 dark:text-gray-500">OVR</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-court-600">{((player.jordan_factor || 0.5) * 100).toFixed(0)}%</div>
                  <div className="text-xs text-gray-400 dark:text-gray-500">JF</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-court-600">
                    {player.games_won || 0}-{(player.games_played || 0) - (player.games_won || 0)}
                  </div>
                  <div className="text-xs text-gray-400 dark:text-gray-500">W-L</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
