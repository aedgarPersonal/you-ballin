/**
 * Game Action Page (Mobile-Friendly, No Login Required)
 * =====================================================
 * Players receive a link like /game/{token} via email/SMS.
 * This page shows game info and lets them RSVP or vote
 * without needing to log in.
 */

import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { getGameAction, rsvpViaToken, voteViaToken } from "../api/gameAction";

export default function GameActionPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);

  const fetchData = async () => {
    try {
      const res = await getGameAction(token);
      setData(res.data);
    } catch (err) {
      setError(
        err.response?.status === 401
          ? "This link has expired. Please ask your admin for a new one."
          : err.response?.data?.detail || "Failed to load game info."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  const handleRsvp = async (status) => {
    setSubmitting(true);
    setSuccessMsg(null);
    try {
      await rsvpViaToken(token, status);
      setSuccessMsg(status === "accepted" ? "You're in! See you on the court!" : "Got it, maybe next time!");
      // Refresh data
      const res = await getGameAction(token);
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to update RSVP");
    } finally {
      setSubmitting(false);
    }
  };

  const handleVote = async (voteType, nomineeId) => {
    setSubmitting(true);
    try {
      await voteViaToken(token, { vote_type: voteType, nominee_id: nomineeId });
      // Refresh
      const res = await getGameAction(token);
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to cast vote");
    } finally {
      setSubmitting(false);
    }
  };

  // --- Loading / Error states ---
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500 mx-auto"></div>
          <p className="text-gray-500 dark:text-gray-400 mt-3">Loading game...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-3">🏀</div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Oops!</h1>
          <p className="text-gray-600 dark:text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const gameDate = new Date(data.game_date);
  const isUpcoming = ["scheduled", "invites_sent", "dropin_open", "teams_set"].includes(data.status);
  const isCompleted = data.status === "completed";
  const isCancelled = data.status === "cancelled";
  const isSkipped = data.status === "skipped";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-4 py-5">
        <div className="max-w-lg mx-auto">
          <p className="text-orange-200 text-xs font-medium uppercase tracking-wide">{data.run_name}</p>
          <h1 className="text-xl font-bold mt-1">{data.title}</h1>
          <p className="text-orange-100 mt-1">
            {gameDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            {" at "}
            {gameDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
          </p>
          <p className="text-orange-200 text-sm mt-0.5">{data.location}</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-4">
        {/* Player greeting */}
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Hey <span className="font-semibold text-gray-700 dark:text-gray-300">{data.user_name}</span>!
        </p>

        {/* Success Message */}
        {successMsg && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 text-center">
            <p className="text-green-700 font-semibold">{successMsg}</p>
          </div>
        )}

        {/* Cancelled / Skipped banners */}
        {isCancelled && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-center">
            <p className="text-red-700 font-semibold">This game has been cancelled.</p>
          </div>
        )}
        {isSkipped && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4 text-center">
            <p className="text-yellow-700 font-semibold">This game has been skipped.</p>
            {data.notes && <p className="text-yellow-600 text-sm mt-1">{data.notes}</p>}
          </div>
        )}

        {/* RSVP Section (upcoming games) */}
        {isUpcoming && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">Are you playing?</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {data.accepted_count}/{data.roster_size} spots filled
            </p>

            {data.rsvp_status === "accepted" ? (
              <div className="space-y-3">
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 text-center">
                  <span className="text-2xl">✅</span>
                  <p className="text-green-700 font-bold mt-1">You're in!</p>
                </div>
                <button
                  onClick={() => handleRsvp("declined")}
                  disabled={submitting}
                  className="w-full py-3 text-sm font-medium text-gray-500 bg-gray-100 dark:bg-gray-700 dark:text-gray-400 rounded-xl"
                >
                  Can't make it anymore
                </button>
              </div>
            ) : data.rsvp_status === "declined" ? (
              <div className="space-y-3">
                <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 text-center">
                  <p className="text-gray-500 dark:text-gray-400">You declined this game.</p>
                </div>
                <button
                  onClick={() => handleRsvp("accepted")}
                  disabled={submitting}
                  className="w-full py-4 text-lg font-bold text-white bg-green-500 hover:bg-green-600 rounded-xl active:scale-95 transition-transform"
                >
                  Changed my mind — I'm in!
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  onClick={() => handleRsvp("accepted")}
                  disabled={submitting}
                  className="w-full py-4 text-lg font-bold text-white bg-green-500 hover:bg-green-600 rounded-xl active:scale-95 transition-transform"
                >
                  {submitting ? "..." : "I'm In! 🏀"}
                </button>
                <button
                  onClick={() => handleRsvp("declined")}
                  disabled={submitting}
                  className="w-full py-3 text-sm font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-400 rounded-xl"
                >
                  Can't make it
                </button>
              </div>
            )}
          </div>
        )}

        {/* Teams Display */}
        {data.teams && data.teams.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">
              Teams {data.my_team && <span className="text-orange-500 text-sm font-normal">— You're on {data.my_team}</span>}
            </h2>
            <div className="space-y-3">
              {data.teams.map((team, idx) => (
                <div key={idx} className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
                  <p className="font-bold text-sm text-gray-800 dark:text-gray-200 mb-1">{team.team_name}</p>
                  <div className="flex flex-wrap gap-1">
                    {team.players.map((p) => (
                      <span
                        key={p.id}
                        className={`text-xs px-2 py-1 rounded-full ${
                          p.id === data.user_id
                            ? "bg-orange-100 text-orange-700 font-bold"
                            : "bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-300"
                        }`}
                      >
                        {p.name}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Score Banner */}
        {isCompleted && data.notes && (
          <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-4 text-center">
            <p className="text-xs font-semibold text-orange-600 uppercase tracking-wide">Final Score</p>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-1">{data.notes}</p>
          </div>
        )}

        {/* Voting Section (completed games with open voting) */}
        {isCompleted && data.voting_open && data.participants && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">Cast Your Votes</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              Voting closes {data.voting_deadline && new Date(data.voting_deadline).toLocaleString("en-US", {
                month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
              })}
            </p>

            {[
              { type: "mvp", label: "MVP", emoji: "🏆", desc: "Best player", color: "yellow" },
              { type: "xfactor", label: "X Factor", emoji: "⚡", desc: "Game changer", color: "blue" },
              { type: "shaqtin", label: "Shaqtin'", emoji: "🤦", desc: "Worst play", color: "purple" },
            ].map(({ type, label, emoji, desc, color }) => {
              const currentVote = data.my_votes?.[type];
              const eligible = data.participants.filter((p) => p.id !== data.user_id);
              const colorClasses = {
                yellow: { bg: "bg-yellow-50 dark:bg-yellow-900/20", border: "border-yellow-300 dark:border-yellow-700", selected: "bg-yellow-100 border-yellow-400 font-semibold" },
                blue: { bg: "bg-blue-50 dark:bg-blue-900/20", border: "border-blue-300 dark:border-blue-700", selected: "bg-blue-100 border-blue-400 font-semibold" },
                purple: { bg: "bg-purple-50 dark:bg-purple-900/20", border: "border-purple-300 dark:border-purple-700", selected: "bg-purple-100 border-purple-400 font-semibold" },
              }[color];

              return (
                <div key={type} className={`mb-4 p-3 rounded-xl border ${colorClasses.border} ${colorClasses.bg}`}>
                  <p className="font-bold text-sm mb-2">{emoji} {label} <span className="font-normal text-gray-500">— {desc}</span></p>
                  <div className="space-y-1.5">
                    {eligible.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => handleVote(type, p.id)}
                        disabled={submitting}
                        className={`w-full text-left px-3 py-2.5 rounded-lg border-2 text-sm transition-all active:scale-95 ${
                          currentVote === p.id
                            ? colorClasses.selected
                            : "border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-800"
                        }`}
                      >
                        <span>{p.name}</span>
                        {currentVote === p.id && <span className="float-right text-xs opacity-70">✓ Your vote</span>}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Awards (voting closed) */}
        {isCompleted && !data.voting_open && data.awards && Object.keys(data.awards).length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Awards</h2>
            <div className="space-y-2">
              {data.awards.mvp && (
                <div className="flex items-center gap-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                  <span className="text-2xl">🏆</span>
                  <div>
                    <p className="text-xs font-semibold text-yellow-600">MVP</p>
                    <p className="font-bold text-gray-900 dark:text-gray-100">{data.awards.mvp.name}</p>
                  </div>
                  <span className="ml-auto text-sm text-yellow-600">{data.awards.mvp.votes} votes</span>
                </div>
              )}
              {data.awards.xfactor && (
                <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <span className="text-2xl">⚡</span>
                  <div>
                    <p className="text-xs font-semibold text-blue-600">X Factor</p>
                    <p className="font-bold text-gray-900 dark:text-gray-100">{data.awards.xfactor.name}</p>
                  </div>
                  <span className="ml-auto text-sm text-blue-600">{data.awards.xfactor.votes} votes</span>
                </div>
              )}
              {data.awards.shaqtin && (
                <div className="flex items-center gap-3 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                  <span className="text-2xl">🤦</span>
                  <div>
                    <p className="text-xs font-semibold text-purple-600">Shaqtin' a Fool</p>
                    <p className="font-bold text-gray-900 dark:text-gray-100">{data.awards.shaqtin.name}</p>
                  </div>
                  <span className="ml-auto text-sm text-purple-600">{data.awards.shaqtin.votes} votes</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 dark:text-gray-500 pt-4 pb-8">
          Powered by You Ballin 🏀
        </p>
      </div>
    </div>
  );
}
