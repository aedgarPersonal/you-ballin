/**
 * Dashboard Page
 * ==============
 * Landing page after login showing upcoming game, player status, and quick actions.
 *
 * TEACHING NOTE:
 *   The dashboard fetches the next upcoming game and shows contextual
 *   content based on the user's player_status and the game's lifecycle.
 */

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import useAuthStore from "../stores/authStore";
import useRunStore from "../stores/runStore";
import { listGames } from "../api/games";
import { getRecentAwards } from "../api/votes";
import { AvatarBadge } from "../components/AvatarPicker";
import { getPlayerById } from "../data/legacyPlayers";

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { currentRun } = useRunStore();
  const runId = currentRun?.id;
  const [nextGame, setNextGame] = useState(null);
  const [recentAwards, setRecentAwards] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!runId) {
      setLoading(false);
      return;
    }
    const fetchData = async () => {
      try {
        const [gamesRes, awardsRes] = await Promise.allSettled([
          listGames(runId),
          getRecentAwards(runId),
        ]);

        if (gamesRes.status === "fulfilled") {
          const upcoming = gamesRes.value.data.find(
            (g) => g.status !== "completed" && g.status !== "cancelled"
          );
          setNextGame(upcoming);
        }

        if (awardsRes.status === "fulfilled") {
          setRecentAwards(awardsRes.value.data);
        }
      } catch {
        // User may be pending, no access yet
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [runId]);

  if (!currentRun) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 text-center">
        <p className="text-gray-500 dark:text-gray-400">Please select a Run from the dropdown above.</p>
      </div>
    );
  }

  const statusMessage = {
    pending: "Your registration is pending admin approval. You'll be notified when you're approved!",
    regular: "You're a regular player. You'll receive weekly game invitations.",
    dropin: "You're a drop-in player. You'll be notified when spots open up on game day.",
    inactive: "Your account is currently inactive. Contact an admin for assistance.",
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Welcome Section */}
      <div className="mb-8 flex items-center gap-4">
        {user?.avatar_url ? (
          <Link to={`/players/${user?.id}`}>
            <AvatarBadge avatarId={user.avatar_url} size="lg" />
          </Link>
        ) : null}
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Welcome back, {user?.full_name?.split(" ")[0]}!
          </h1>
          {currentRun && (
            <p className="text-sm font-medium text-court-600 mt-0.5">{currentRun.name}</p>
          )}
          <p className="text-gray-600 dark:text-gray-400 mt-1">{statusMessage[user?.player_status] || ""}</p>
          {user?.avatar_url && getPlayerById(user.avatar_url) && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              Repping {getPlayerById(user.avatar_url).name} — {getPlayerById(user.avatar_url).team}
            </p>
          )}
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Player Status */}
        <div className="card">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Your Status</h3>
          <div className="mt-2 flex items-center gap-2">
            <span className={`badge-${user?.player_status}`}>{user?.player_status}</span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {user?.role === "super_admin" && "(Super Admin)"}
            </span>
          </div>
        </div>

        {/* Win Rate */}
        <div className="card">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Win Rate</h3>
          <div className="mt-2">
            <div className="text-3xl font-bold text-court-600">
              {((user?.jordan_factor || 0.5) * 100).toFixed(0)}%
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {user?.games_won || 0}W - {(user?.games_played || 0) - (user?.games_won || 0)}L
            </div>
          </div>
        </div>
      </div>

      {/* Next Game */}
      <div className="card">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Next Game</h2>
        {loading ? (
          <p className="text-gray-500 dark:text-gray-400">Loading...</p>
        ) : nextGame ? (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold">{nextGame.title}</h3>
              <p className="text-gray-600 dark:text-gray-400">
                {new Date(nextGame.game_date).toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {nextGame.location} &middot; {nextGame.accepted_count}/{nextGame.roster_size} players
              </p>
              <span className={`badge mt-2 ${
                nextGame.status === "teams_set" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" :
                nextGame.status === "dropin_open" ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" :
                "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
              }`}>
                {nextGame.status.replace("_", " ")}
              </span>
            </div>
            <Link to={`/games/${nextGame.id}`} className="btn-primary">
              View Details
            </Link>
          </div>
        ) : (
          <p className="text-gray-500 dark:text-gray-400">No upcoming games scheduled.</p>
        )}
      </div>

      {/* Recent Award Winners */}
      {recentAwards.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Recent Award Winners</h2>
          <div className="space-y-4">
            {recentAwards.map((game) => (
              <Link
                key={game.game_id}
                to={`/games/${game.game_id}`}
                className="card hover:shadow-md transition-shadow block"
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">{game.game_title}</h3>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(game.game_date).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* MVP */}
                  <AwardCard
                    label="MVP"
                    emoji="🏆"
                    winner={game.mvp}
                    gradient="from-yellow-50 to-amber-50"
                    border="border-yellow-300"
                    labelColor="text-yellow-700"
                    nameColor="text-yellow-900"
                  />
                  {/* X Factor */}
                  <AwardCard
                    label="X Factor"
                    emoji="⚡"
                    winner={game.xfactor}
                    gradient="from-blue-50 to-indigo-50"
                    border="border-blue-300"
                    labelColor="text-blue-700"
                    nameColor="text-blue-900"
                  />
                  {/* Shaqtin' */}
                  <AwardCard
                    label="Shaqtin'"
                    emoji="🤦"
                    winner={game.shaqtin}
                    gradient="from-purple-50 to-fuchsia-50"
                    border="border-purple-300"
                    labelColor="text-purple-700"
                    nameColor="text-purple-900"
                  />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Quick Links */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mt-8">
        <Link to="/games" className="card hover:shadow-md transition-shadow text-center">
          <span className="text-3xl">📅</span>
          <p className="mt-2 font-medium">All Games</p>
        </Link>
        <Link to="/players" className="card hover:shadow-md transition-shadow text-center">
          <span className="text-3xl">👥</span>
          <p className="mt-2 font-medium">Players</p>
        </Link>
        <Link to="/stats" className="card hover:shadow-md transition-shadow text-center">
          <span className="text-3xl">📊</span>
          <p className="mt-2 font-medium">Stats</p>
        </Link>
        <Link to="/notifications" className="card hover:shadow-md transition-shadow text-center">
          <span className="text-3xl">🔔</span>
          <p className="mt-2 font-medium">Notifications</p>
        </Link>
        <Link to={`/players/${user?.id}`} className="card hover:shadow-md transition-shadow text-center">
          <span className="text-3xl">⭐</span>
          <p className="mt-2 font-medium">My Profile</p>
        </Link>
      </div>
    </div>
  );
}


/**
 * AwardCard — a mini card for displaying a single award winner.
 */
function AwardCard({ label, emoji, winner, gradient, border, labelColor, nameColor }) {
  return (
    <div className={`bg-gradient-to-br ${gradient} ${border} dark:border-gray-600 dark:from-gray-700 dark:to-gray-700 border rounded-lg p-3 text-center`}>
      <div className="text-2xl mb-1">{emoji}</div>
      <div className={`text-[10px] font-bold uppercase tracking-wider ${labelColor} mb-1`}>{label}</div>
      {winner ? (
        <>
          <div className="flex justify-center mb-1">
            {winner.player.avatar_url ? (
              <AvatarBadge avatarId={winner.player.avatar_url} size="sm" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-white/60 flex items-center justify-center text-sm font-bold text-gray-600 dark:text-gray-400">
                {winner.player.full_name.charAt(0)}
              </div>
            )}
          </div>
          <div className={`text-sm font-bold ${nameColor} truncate`}>{winner.player.full_name}</div>
          <div className="text-[10px] text-gray-500 dark:text-gray-400">{winner.vote_count} vote{winner.vote_count !== 1 ? "s" : ""}</div>
        </>
      ) : (
        <div className="text-xs text-gray-400 dark:text-gray-500 italic">No votes</div>
      )}
    </div>
  );
}
