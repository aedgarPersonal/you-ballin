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
  scheduled: "bg-gray-700 text-gray-300",
  invites_sent: "bg-blue-900/30 text-blue-400",
  dropin_open: "bg-yellow-900/30 text-yellow-400",
  teams_set: "bg-green-900/30 text-green-400",
  completed: "bg-purple-900/30 text-purple-400",
  cancelled: "bg-red-900/40 text-red-300 font-bold",
};

export default function GamesPage() {
  const { currentRun, isRunAdmin } = useRunStore();
  const currentUser = useAuthStore((s) => s.user);
  const isAdmin = currentUser?.role === "super_admin" || isRunAdmin;
  const runId = currentRun?.id;

  // Gate pending/inactive users
  if (currentUser?.player_status === "pending" || currentUser?.player_status === "inactive") {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 text-center">
        <div className="text-5xl mb-4">⏳</div>
        <h2 className="font-retro text-base text-gray-100 mb-2">
          {currentUser.player_status === "pending" ? "Registration Pending" : "Account Inactive"}
        </h2>
        <p className="text-gray-400">
          {currentUser.player_status === "pending"
            ? "Your registration is being reviewed. You'll see games once approved!"
            : "Your account is inactive. Contact an admin for help."}
        </p>
      </div>
    );
  }
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
        <p className="text-gray-400">Please select a Run from the dropdown above.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="font-retro text-base text-gray-100">GAMES</h1>
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
            className="input w-auto font-retro text-[9px]"
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
        <div className="card mb-6 border-2 border-court-700">
          <h3 className="font-retro text-[8px] text-gray-300 tracking-wider mb-3">CREATE GAME</h3>
          <form onSubmit={handleCreateGame} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Title *</label>
              <input type="text" required value={newGame.title} onChange={(e) => setNewGame({ ...newGame, title: e.target.value })}
                placeholder="e.g. Special Pickup" className="input text-sm w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Date *</label>
              <input type="date" required value={newGame.game_date} onChange={(e) => setNewGame({ ...newGame, game_date: e.target.value })}
                className="input text-sm w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Time</label>
              <input type="time" value={newGame.game_time} onChange={(e) => setNewGame({ ...newGame, game_time: e.target.value })}
                className="input text-sm w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Location</label>
              <input type="text" value={newGame.location} onChange={(e) => setNewGame({ ...newGame, location: e.target.value })}
                placeholder={currentRun?.default_location || "TBD"} className="input text-sm w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Teams</label>
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
        <p className="text-gray-400">Loading games...</p>
      ) : games.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-400">No games found.</p>
        </div>
      ) : (
        <GamesList games={games} />
      )}
    </div>
  );
}

function GamesList({ games }) {
  const [showPast, setShowPast] = useState(false);
  const now = new Date();

  const activeStatuses = ["scheduled", "invites_sent", "dropin_open", "teams_set"];
  const pastStatuses = ["completed", "cancelled", "skipped"];

  // Split into active (upcoming/in-progress) and past
  const activeGames = games.filter((g) => activeStatuses.includes(g.status));
  const pastGames = games.filter((g) => pastStatuses.includes(g.status));

  // The priority game: the next upcoming one (soonest date in active games)
  const sortedActive = [...activeGames].sort(
    (a, b) => new Date(a.game_date) - new Date(b.game_date)
  );
  const priorityGame = sortedActive[0] || null;
  const otherActive = sortedActive.slice(1);

  return (
    <div className="space-y-6">
      {/* Priority game — large, highlighted */}
      {priorityGame && (
        <div>
          <h2 className="font-retro text-[8px] text-court-400 tracking-widest mb-2">Next Up</h2>
          <GameCard game={priorityGame} priority />
        </div>
      )}

      {/* Other active games */}
      {otherActive.length > 0 && (
        <div>
          <h2 className="font-retro text-[7px] text-gray-400 tracking-widest mb-2">Upcoming</h2>
          <div className="space-y-3">
            {otherActive.map((g) => <GameCard key={g.id} game={g} />)}
          </div>
        </div>
      )}

      {/* Past games — collapsed */}
      {pastGames.length > 0 && (
        <div>
          <button onClick={() => setShowPast(!showPast)}
            className="font-retro text-[7px] text-gray-400 tracking-widest hover:text-gray-300">
            {showPast ? "Hide" : "Show"} Past Games ({pastGames.length})
          </button>
          {showPast && (
            <div className="space-y-3 mt-2">
              {pastGames.map((g) => <GameCard key={g.id} game={g} past />)}
            </div>
          )}
        </div>
      )}

      {/* No active games message */}
      {!priorityGame && pastGames.length > 0 && (
        <p className="text-sm text-gray-400">No upcoming games scheduled.</p>
      )}
    </div>
  );
}

function GameCard({ game, priority = false, past = false }) {
  const isCancelled = game.status === "cancelled";

  // Status-specific border gradients
  const borderColors = {
    scheduled: "from-gray-400 via-gray-300 to-gray-400",
    invites_sent: "from-blue-400 via-blue-300 to-blue-500",
    dropin_open: "from-yellow-400 via-amber-300 to-yellow-500",
    teams_set: "from-green-400 via-emerald-300 to-green-500",
    completed: "from-purple-400 via-purple-300 to-purple-500",
    cancelled: "from-red-400 via-red-300 to-red-500",
    skipped: "from-gray-500 via-gray-400 to-gray-500",
  };

  // Header strip color per status
  const headerColors = {
    scheduled: "from-gray-600 to-gray-700",
    invites_sent: "from-blue-700 via-blue-600 to-arcade-600",
    dropin_open: "from-yellow-700 via-amber-600 to-court-600",
    teams_set: "from-green-700 via-emerald-600 to-green-600",
    completed: "from-purple-700 via-purple-600 to-purple-500",
    cancelled: "from-red-800 to-red-700",
    skipped: "from-gray-700 to-gray-600",
  };

  const border = priority
    ? "from-amber-300 via-yellow-400 to-amber-500"
    : borderColors[game.status] || borderColors.scheduled;

  const header = priority
    ? "from-arcade-700 via-arcade-600 to-court-600"
    : headerColors[game.status] || headerColors.scheduled;

  return (
    <Link
      to={`/games/${game.id}`}
      className={`block rounded-xl overflow-hidden transition-shadow hover:shadow-xl ${past ? "opacity-60" : ""}`}
    >
      <div className={`rounded-xl bg-gradient-to-b ${border} p-[2px]`}>
        <div className="rounded-[10px] bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 overflow-hidden">

          {/* Header strip */}
          <div className={`bg-gradient-to-r ${header} px-4 py-1.5 flex items-center justify-between`}>
            <span className={`badge ${STATUS_COLORS[game.status]}`}>
              {STATUS_LABELS[game.status]}
            </span>
            <span className="text-[10px] text-white/50">
              {game.accepted_count}/{game.roster_size} players
            </span>
          </div>

          {/* Card body */}
          <div className="px-4 py-3">
            <h3 className={`font-retro text-[10px] leading-tight ${
              isCancelled ? "line-through text-red-400" : "text-white"
            }`}>
              {game.title.toUpperCase()}
            </h3>
            <p className="text-sm text-gray-400 mt-1">
              {new Date(game.game_date).toLocaleDateString("en-US", {
                weekday: "long", month: "long", day: "numeric", year: "numeric",
                hour: "numeric", minute: "2-digit",
              })}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{game.location}</p>
          </div>

          {/* Voting banner for completed games */}
          {game.status === "completed" && game.voting_open && (
            <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-yellow-900/20 border border-yellow-700/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm">🗳️</span>
                <span className="font-retro text-[8px] text-yellow-400 animate-pulse">VOTING OPEN</span>
              </div>
              <div className="text-[10px] text-yellow-400/80">
                {game.votes_cast}/{game.total_voters} voted
                {game.voting_deadline && (
                  <span className="text-gray-500 ml-1.5">
                    · ends {new Date(game.voting_deadline).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Odds line if available */}
          {game.odds_line && (
            <div className="px-4 pb-2">
              <span className="text-xs font-mono text-gray-500">{game.odds_line}</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
