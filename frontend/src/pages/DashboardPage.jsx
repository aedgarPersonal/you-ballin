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
import { listGames } from "../api/games";

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const [nextGame, setNextGame] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNextGame = async () => {
      try {
        const { data } = await listGames();
        // Find next upcoming game
        const upcoming = data.find(
          (g) => g.status !== "completed" && g.status !== "cancelled"
        );
        setNextGame(upcoming);
      } catch {
        // User may be pending, no access yet
      } finally {
        setLoading(false);
      }
    };
    fetchNextGame();
  }, []);

  const statusMessage = {
    pending: "Your registration is pending admin approval. You'll be notified when you're approved!",
    regular: "You're a regular player. You'll receive weekly game invitations.",
    dropin: "You're a drop-in player. You'll be notified when spots open up on game day.",
    inactive: "Your account is currently inactive. Contact an admin for assistance.",
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Welcome Section */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome back, {user?.full_name?.split(" ")[0]}!
        </h1>
        <p className="text-gray-600 mt-1">{statusMessage[user?.player_status] || ""}</p>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Player Status */}
        <div className="card">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Your Status</h3>
          <div className="mt-2 flex items-center gap-2">
            <span className={`badge-${user?.player_status}`}>{user?.player_status}</span>
            <span className="text-sm text-gray-500">
              {user?.role === "admin" && "(Admin)"}
            </span>
          </div>
        </div>

        {/* Your Ratings */}
        <div className="card">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Your Ratings</h3>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-lg font-bold text-court-600">{user?.avg_offense?.toFixed(1)}</div>
              <div className="text-xs text-gray-500">Offense</div>
            </div>
            <div>
              <div className="text-lg font-bold text-court-600">{user?.avg_defense?.toFixed(1)}</div>
              <div className="text-xs text-gray-500">Defense</div>
            </div>
            <div>
              <div className="text-lg font-bold text-court-600">{user?.avg_overall?.toFixed(1)}</div>
              <div className="text-xs text-gray-500">Overall</div>
            </div>
          </div>
        </div>

        {/* Win Rate */}
        <div className="card">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Win Rate</h3>
          <div className="mt-2">
            <div className="text-3xl font-bold text-court-600">
              {((user?.winner_rating || 0.5) * 100).toFixed(0)}%
            </div>
            <div className="text-xs text-gray-500">Career win percentage</div>
          </div>
        </div>
      </div>

      {/* Next Game */}
      <div className="card">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Next Game</h2>
        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : nextGame ? (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold">{nextGame.title}</h3>
              <p className="text-gray-600">
                {new Date(nextGame.game_date).toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {nextGame.location} &middot; {nextGame.accepted_count}/{nextGame.roster_size} players
              </p>
              <span className={`badge mt-2 ${
                nextGame.status === "teams_set" ? "bg-green-100 text-green-800" :
                nextGame.status === "dropin_open" ? "bg-yellow-100 text-yellow-800" :
                "bg-blue-100 text-blue-800"
              }`}>
                {nextGame.status.replace("_", " ")}
              </span>
            </div>
            <Link to={`/games/${nextGame.id}`} className="btn-primary">
              View Details
            </Link>
          </div>
        ) : (
          <p className="text-gray-500">No upcoming games scheduled.</p>
        )}
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
        <Link to="/games" className="card hover:shadow-md transition-shadow text-center">
          <span className="text-3xl">📅</span>
          <p className="mt-2 font-medium">All Games</p>
        </Link>
        <Link to="/players" className="card hover:shadow-md transition-shadow text-center">
          <span className="text-3xl">👥</span>
          <p className="mt-2 font-medium">Players</p>
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
