/**
 * Players List Page
 * =================
 * Browse all approved players in the group.
 */

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { listPlayers } from "../api/players";

export default function PlayersPage() {
  const [players, setPlayers] = useState([]);
  const [search, setSearch] = useState("");
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Players</h1>
        <input
          type="text"
          placeholder="Search players..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input w-64"
        />
      </div>

      {loading ? (
        <p className="text-gray-500">Loading players...</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {players.map((player) => (
            <Link key={player.id} to={`/players/${player.id}`} className="card hover:shadow-md transition-shadow">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-court-100 flex items-center justify-center text-court-600 font-bold text-lg">
                  {player.full_name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{player.full_name}</h3>
                  <p className="text-sm text-gray-500">@{player.username}</p>
                  <span className={`badge-${player.player_status} mt-1`}>
                    {player.player_status}
                  </span>
                </div>
              </div>

              {/* Mini Ratings */}
              <div className="grid grid-cols-4 gap-2 mt-4 text-center">
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
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
