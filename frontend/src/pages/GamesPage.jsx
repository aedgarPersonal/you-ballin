/**
 * Games List Page
 * ===============
 * Shows all games with status filters.
 */

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import useRunStore from "../stores/runStore";
import useAuthStore from "../stores/authStore";
import { listGames, createGame } from "../api/games";

const STATUS_LABELS = {
  scheduled: "Scheduled",
  invites_sent: "Invites Sent",
  dropin_open: "Drop-in Open",
  teams_set: "Teams Set",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_COLORS = {
  scheduled: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
  invites_sent: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  dropin_open: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  teams_set: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  completed: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  cancelled: "bg-red-200 text-red-900 dark:bg-red-900/40 dark:text-red-300 font-bold",
};

export default function GamesPage() {
  const { currentRun, isRunAdmin } = useRunStore();
  const currentUser = useAuthStore((s) => s.user);
  const isAdmin = currentUser?.role === "super_admin" || isRunAdmin;
  const runId = currentRun?.id;
  const [games, setGames] = useState([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newGame, setNewGame] = useState({ title: "", game_date: "", game_time: "20:00", location: currentRun?.default_location || "", num_teams: 2 });

  const fetchGames = async () => {
    if (!runId) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data } = await listGames(runId, filter || undefined);
      setGames(data);
    } catch {
      setGames([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchGames(); }, [runId, filter]);

  const handleCreateGame = async (e) => {
    e.preventDefault();
    try {
      const gameDate = newGame.game_time
        ? new Date(`${newGame.game_date}T${newGame.game_time}`).toISOString()
        : new Date(newGame.game_date).toISOString();
      await createGame(runId, {
        title: newGame.title,
        game_date: gameDate,
        location: newGame.location || currentRun?.default_location || "TBD",
        num_teams: newGame.num_teams,
      });
      toast.success("Game created!");
      setShowCreate(false);
      setNewGame({ title: "", game_date: "", game_time: "20:00", location: currentRun?.default_location || "", num_teams: 2 });
      fetchGames();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create game");
    }
  };

  if (!currentRun) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 text-center">
        <p className="text-gray-500 dark:text-gray-400">Please select a Run from the dropdown above.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Games</h1>
          {currentRun && <p className="text-sm text-court-600">{currentRun.name}</p>}
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <button onClick={() => setShowCreate(!showCreate)} className="btn-primary text-sm">
              {showCreate ? "Cancel" : "+ New Game"}
            </button>
          )}
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
      </div>

      {/* Create Game Form (admin only) */}
      {showCreate && (
        <div className="card mb-6 border-2 border-court-300 dark:border-court-700">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Create One-Off Game</h3>
          <form onSubmit={handleCreateGame} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Title *</label>
              <input type="text" required value={newGame.title} onChange={(e) => setNewGame({ ...newGame, title: e.target.value })}
                placeholder="e.g. Special Pickup" className="input text-sm w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Date *</label>
              <input type="date" required value={newGame.game_date} onChange={(e) => setNewGame({ ...newGame, game_date: e.target.value })}
                className="input text-sm w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Time</label>
              <input type="time" value={newGame.game_time} onChange={(e) => setNewGame({ ...newGame, game_time: e.target.value })}
                className="input text-sm w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Location</label>
              <input type="text" value={newGame.location} onChange={(e) => setNewGame({ ...newGame, location: e.target.value })}
                placeholder={currentRun?.default_location || "TBD"} className="input text-sm w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Teams</label>
              <select value={newGame.num_teams} onChange={(e) => setNewGame({ ...newGame, num_teams: Number(e.target.value) })}
                className="input text-sm w-full">
                {[2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <button type="submit" className="btn-primary w-full">Create Game</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 dark:text-gray-400">Loading games...</p>
      ) : games.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500 dark:text-gray-400">No games found.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {games.map((game) => (
            <Link key={game.id} to={`/games/${game.id}`} className={`card block hover:shadow-md transition-shadow ${game.status === "cancelled" ? "opacity-60 border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/10" : ""}`}>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h3 className={`text-lg font-semibold ${game.status === "cancelled" ? "line-through text-red-600 dark:text-red-400" : "text-gray-900 dark:text-gray-100"}`}>{game.title}</h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    {new Date(game.game_date).toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{game.location}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {game.accepted_count}/{game.roster_size} players
                  </span>
                  <span className={`badge ${STATUS_COLORS[game.status]}`}>
                    {STATUS_LABELS[game.status]}
                  </span>
                </div>
              </div>
              {/* Vegas Odds Line */}
              {game.odds_line && (
                <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                  <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                    📊 {game.odds_line}
                  </span>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
