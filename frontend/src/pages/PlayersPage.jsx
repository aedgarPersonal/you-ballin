/**
 * Players List Page with Leaderboard
 * ===================================
 * Browse all approved players with sortable leaderboard view.
 */

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { listPlayers } from "../api/players";
import { AvatarBadge } from "../components/AvatarPicker";

const SORT_OPTIONS = [
  { value: "name", label: "Name" },
  { value: "jordan_factor", label: "Jordan Factor" },
  { value: "games_won", label: "Total Wins" },
  { value: "games_played", label: "Games Played" },
  { value: "avg_overall", label: "Overall Rating" },
  { value: "mvp_count", label: "MVP Awards" },
  { value: "xfactor_count", label: "X Factor Awards" },
];

export default function PlayersPage() {
  const [players, setPlayers] = useState([]);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("jordan_factor");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data } = await listPlayers({ search: search || undefined });
        setPlayers(data.users);
      } catch {
        setPlayers([]);
      } finally {
        setLoading(false);
      }
    };
    const debounce = setTimeout(fetch, 300);
    return () => clearTimeout(debounce);
  }, [search]);

  const sortedPlayers = [...players].sort((a, b) => {
    if (sortBy === "name") return a.full_name.localeCompare(b.full_name);
    // Sort descending for numeric stats
    return (b[sortBy] || 0) - (a[sortBy] || 0);
  });

  const isRanked = sortBy !== "name";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Players</h1>
        <div className="flex items-center gap-3">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2"
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
        <p className="text-gray-500">Loading players...</p>
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
                    "bg-gray-100 text-gray-500"
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
                  <h3 className="font-semibold text-gray-900 truncate">{player.full_name}</h3>
                  <p className="text-sm text-gray-500">@{player.username}</p>
                  <span className={`badge-${player.player_status} mt-1`}>
                    {player.player_status}
                  </span>
                </div>
              </div>

              {/* Award Badges */}
              {(player.mvp_count > 0 || player.xfactor_count > 0 || player.shaqtin_count > 0) && (
                <div className="flex gap-2 mt-3 flex-wrap">
                  {player.mvp_count > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                      🏆 {player.mvp_count}
                    </span>
                  )}
                  {player.xfactor_count > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                      ⚡ {player.xfactor_count}
                    </span>
                  )}
                  {player.shaqtin_count > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                      🤦 {player.shaqtin_count}
                    </span>
                  )}
                </div>
              )}

              {/* Stats Grid */}
              <div className="grid grid-cols-5 gap-2 mt-3 text-center">
                <div>
                  <div className="text-sm font-bold text-court-600">{player.avg_offense?.toFixed(1)}</div>
                  <div className="text-xs text-gray-400">OFF</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-court-600">{player.avg_defense?.toFixed(1)}</div>
                  <div className="text-xs text-gray-400">DEF</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-court-600">{player.avg_overall?.toFixed(1)}</div>
                  <div className="text-xs text-gray-400">OVR</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-court-600">{((player.jordan_factor || 0.5) * 100).toFixed(0)}%</div>
                  <div className="text-xs text-gray-400">JF</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-court-600">
                    {player.games_won || 0}-{(player.games_played || 0) - (player.games_won || 0)}
                  </div>
                  <div className="text-xs text-gray-400">W-L</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
