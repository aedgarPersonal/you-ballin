/**
 * Game Detail Page
 * ================
 * Shows game info, RSVPs, team assignments, and RSVP/admin actions.
 *
 * TEACHING NOTE:
 *   This is the most complex page, combining:
 *   - Game info display
 *   - RSVP action (accept/decline)
 *   - Team roster (when teams are set)
 *   - Admin actions (generate teams, record results)
 */

import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import toast from "react-hot-toast";
import useAuthStore from "../stores/authStore";
import { getGame, rsvpToGame, generateTeams, recordResult } from "../api/games";

export default function GameDetailPage() {
  const { id } = useParams();
  const user = useAuthStore((s) => s.user);
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchGame = async () => {
    try {
      const { data } = await getGame(id);
      setGame(data);
    } catch {
      toast.error("Failed to load game");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchGame(); }, [id]);

  const handleRsvp = async (status) => {
    try {
      await rsvpToGame(id, status);
      toast.success(status === "accepted" ? "You're in!" : "RSVP updated");
      fetchGame();
    } catch (err) {
      toast.error(err.response?.data?.detail || "RSVP failed");
    }
  };

  const handleGenerateTeams = async () => {
    try {
      await generateTeams(id);
      toast.success("Teams generated!");
      fetchGame();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to generate teams");
    }
  };

  const handleRecordResult = async (winner) => {
    try {
      await recordResult(id, { winning_team: winner });
      toast.success("Result recorded!");
      fetchGame();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to record result");
    }
  };

  if (loading) return <div className="max-w-4xl mx-auto px-4 py-8">Loading...</div>;
  if (!game) return <div className="max-w-4xl mx-auto px-4 py-8">Game not found</div>;

  const myRsvp = game.rsvps?.find((r) => r.user_id === user?.id);
  const teamA = game.teams?.filter((t) => t.team === "team_a") || [];
  const teamB = game.teams?.filter((t) => t.team === "team_b") || [];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Game Header */}
      <div className="card mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{game.title}</h1>
        <p className="text-gray-600 mt-1">
          {new Date(game.game_date).toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
        <p className="text-gray-500">{game.location}</p>
        <div className="flex items-center gap-4 mt-4">
          <span className="text-sm font-medium">
            {game.accepted_count}/{game.roster_size} players
          </span>
          <span className="badge bg-blue-100 text-blue-800">
            {game.status.replace("_", " ")}
          </span>
        </div>
        {game.notes && <p className="text-gray-600 mt-4 italic">{game.notes}</p>}
      </div>

      {/* RSVP Section */}
      {game.status !== "completed" && game.status !== "cancelled" && (
        <div className="card mb-6">
          <h2 className="text-lg font-semibold mb-3">Your RSVP</h2>
          {myRsvp ? (
            <div className="flex items-center gap-4">
              <span className={`badge ${
                myRsvp.status === "accepted" ? "bg-green-100 text-green-800" :
                myRsvp.status === "declined" ? "bg-red-100 text-red-800" :
                "bg-gray-100 text-gray-800"
              }`}>
                {myRsvp.status}
              </span>
              {myRsvp.status !== "accepted" && (
                <button onClick={() => handleRsvp("accepted")} className="btn-primary text-sm">
                  Accept
                </button>
              )}
              {myRsvp.status !== "declined" && (
                <button onClick={() => handleRsvp("declined")} className="btn-secondary text-sm">
                  Decline
                </button>
              )}
            </div>
          ) : (
            <div className="flex gap-3">
              <button onClick={() => handleRsvp("accepted")} className="btn-primary">
                I'm In!
              </button>
              <button onClick={() => handleRsvp("declined")} className="btn-secondary">
                Can't Make It
              </button>
            </div>
          )}
        </div>
      )}

      {/* Teams Display */}
      {game.teams?.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <TeamCard name="Team A" players={teamA} color="orange" />
          <TeamCard name="Team B" players={teamB} color="blue" />
        </div>
      )}

      {/* RSVP List */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold mb-3">RSVPs ({game.rsvps?.length || 0})</h2>
        {game.rsvps?.length > 0 ? (
          <div className="space-y-2">
            {game.rsvps.map((rsvp) => (
              <div key={rsvp.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <span className="font-medium">{rsvp.user?.full_name || `Player #${rsvp.user_id}`}</span>
                <span className={`badge ${
                  rsvp.status === "accepted" ? "bg-green-100 text-green-800" :
                  rsvp.status === "declined" ? "bg-red-100 text-red-800" :
                  rsvp.status === "waitlist" ? "bg-yellow-100 text-yellow-800" :
                  "bg-gray-100 text-gray-800"
                }`}>
                  {rsvp.status}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No RSVPs yet.</p>
        )}
      </div>

      {/* Admin Actions */}
      {user?.role === "admin" && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-3">Admin Actions</h2>
          <div className="flex flex-wrap gap-3">
            {game.status !== "teams_set" && game.status !== "completed" && (
              <button onClick={handleGenerateTeams} className="btn-primary">
                Generate Teams
              </button>
            )}
            {game.status === "teams_set" && (
              <>
                <button onClick={() => handleRecordResult("team_a")} className="bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2 px-4 rounded-lg">
                  Team A Wins
                </button>
                <button onClick={() => handleRecordResult("team_b")} className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg">
                  Team B Wins
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TeamCard({ name, players, color }) {
  const starters = players.filter((p) => p.is_starter);
  const subs = players.filter((p) => !p.is_starter);

  return (
    <div className={`card border-l-4 ${color === "orange" ? "border-l-orange-500" : "border-l-blue-500"}`}>
      <h3 className={`text-lg font-bold ${color === "orange" ? "text-orange-600" : "text-blue-600"}`}>
        {name}
      </h3>
      <div className="mt-3">
        <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Starters</p>
        {starters.map((p) => (
          <div key={p.id} className="py-1 text-sm font-medium">{p.user?.full_name || `Player #${p.user_id}`}</div>
        ))}
        {subs.length > 0 && (
          <>
            <p className="text-xs font-semibold text-gray-400 uppercase mt-3 mb-2">Substitutes</p>
            {subs.map((p) => (
              <div key={p.id} className="py-1 text-sm text-gray-600">{p.user?.full_name || `Player #${p.user_id}`}</div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
