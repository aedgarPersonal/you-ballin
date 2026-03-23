/**
 * Games List Page
 * ===============
 * Shows all games with status filters.
 */

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { listGames } from "../api/games";

const STATUS_LABELS = {
  scheduled: "Scheduled",
  invites_sent: "Invites Sent",
  dropin_open: "Drop-in Open",
  teams_set: "Teams Set",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_COLORS = {
  scheduled: "bg-gray-100 text-gray-800",
  invites_sent: "bg-blue-100 text-blue-800",
  dropin_open: "bg-yellow-100 text-yellow-800",
  teams_set: "bg-green-100 text-green-800",
  completed: "bg-purple-100 text-purple-800",
  cancelled: "bg-red-100 text-red-800",
};

export default function GamesPage() {
  const [games, setGames] = useState([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data } = await listGames(filter || undefined);
        setGames(data);
      } catch {
        setGames([]);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [filter]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Games</h1>

        {/* Filter */}
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="input w-auto"
        >
          <option value="">All Games</option>
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading games...</p>
      ) : games.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500">No games found.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {games.map((game) => (
            <Link key={game.id} to={`/games/${game.id}`} className="card block hover:shadow-md transition-shadow">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{game.title}</h3>
                  <p className="text-gray-600">
                    {new Date(game.game_date).toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                  <p className="text-sm text-gray-500">{game.location}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-600">
                    {game.accepted_count}/{game.roster_size} players
                  </span>
                  <span className={`badge ${STATUS_COLORS[game.status]}`}>
                    {STATUS_LABELS[game.status]}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
