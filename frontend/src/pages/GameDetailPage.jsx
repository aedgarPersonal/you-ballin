/**
 * Game Detail Page
 * ================
 * Shows game info, RSVPs, team assignments, RSVP/admin actions,
 * and the MVP / Shaqtin' a Fool voting section.
 *
 * TEACHING NOTE:
 *   This is the most complex page, combining:
 *   - Game info display
 *   - RSVP action (accept/decline)
 *   - Team roster (when teams are set) — supports N teams
 *   - Admin actions (generate teams, record results, cancel game)
 *   - Post-game voting (MVP and Shaqtin' a Fool)
 *   - Award results (after voting closes)
 */

import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import useAuthStore from "../stores/authStore";
import useRunStore from "../stores/runStore";
import { getGame, updateGame, rsvpToGame, generateTeams, recordResult, cancelGame } from "../api/games";
import { castVote, getMyVotes, getGameAwards } from "../api/votes";
import NbaJamTeams from "../components/NbaJamTeams";
import TeamEditor from "../components/TeamEditor";

export default function GameDetailPage() {
  const { id } = useParams();
  const user = useAuthStore((s) => s.user);
  const { currentRun } = useRunStore();
  const runId = currentRun?.id;
  const navigate = useNavigate();
  const [game, setGame] = useState(null);
  const [scores, setScores] = useState({});
  const [awards, setAwards] = useState(null);
  const [myVotes, setMyVotes] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [editingTeams, setEditingTeams] = useState(false);
  const [gameCommentary, setGameCommentary] = useState("");

  const fetchGame = async () => {
    if (!runId) return;
    try {
      const { data } = await getGame(runId, id);
      setGame(data);

      // Fetch awards and votes if game is completed
      if (data.status === "completed") {
        try {
          const [awardsRes, votesRes] = await Promise.all([
            getGameAwards(runId, id),
            getMyVotes(runId, id),
          ]);
          setAwards(awardsRes.data);
          setMyVotes(votesRes.data);
        } catch {
          // Voting data may not be available yet
        }
      }
    } catch {
      toast.error("Failed to load game");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (runId) {
      fetchGame();
    } else {
      setLoading(false);
    }
  }, [id, runId]);

  const handleRsvp = async (status) => {
    try {
      await rsvpToGame(runId, id, status);
      toast.success(status === "accepted" ? "You're in!" : "RSVP updated");
      fetchGame();
    } catch (err) {
      toast.error(err.response?.data?.detail || "RSVP failed");
    }
  };

  const handleGenerateTeams = async () => {
    const isRegen = game.status === "teams_set";
    const msg = isRegen
      ? "Regenerate teams? Current assignments will be replaced and players will be notified."
      : "Generate teams? Players will be notified of their assignments.";
    if (!confirm(msg)) return;
    try {
      await generateTeams(runId, id);
      toast.success("Teams generated! Players have been notified.");
      fetchGame();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to generate teams");
    }
  };

  const handleRecordResult = async () => {
    const totalGames = Object.values(scores).reduce((sum, v) => sum + (parseInt(v) || 0), 0);
    if (totalGames === 0) {
      toast.error("Enter at least one win");
      return;
    }
    const scoreSummary = uniqueTeams
      .map((t) => `${t.name}: ${scores[t.id] || 0}`)
      .join(", ");
    if (!confirm(`Record results? ${scoreSummary}. This cannot be undone.`)) return;
    try {
      const team_scores = uniqueTeams.map((t) => ({
        team: t.id,
        wins: parseInt(scores[t.id]) || 0,
      }));
      await recordResult(runId, id, {
        team_scores,
        commentary: gameCommentary.trim() || null,
      });
      toast.success("Results recorded! Players have been notified.");
      fetchGame();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to record result");
    }
  };

  const handleCancelGame = async () => {
    if (!confirm("Cancel this game? All RSVPed players will be notified.")) return;
    try {
      await cancelGame(runId, id);
      toast.success("Game cancelled. Players have been notified.");
      fetchGame();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to cancel game");
    }
  };

  const handleStartEdit = () => {
    setEditForm({
      title: game.title,
      game_date: game.game_date ? new Date(game.game_date).toISOString().slice(0, 16) : "",
      location: game.location,
      notes: game.notes || "",
    });
    setEditing(true);
  };

  const handleSaveEdit = async () => {
    try {
      const payload = {};
      if (editForm.title !== game.title) payload.title = editForm.title;
      if (editForm.location !== game.location) payload.location = editForm.location;
      if (editForm.notes !== (game.notes || "")) payload.notes = editForm.notes || null;
      if (editForm.game_date) {
        const newDate = new Date(editForm.game_date).toISOString();
        if (newDate !== game.game_date) payload.game_date = newDate;
      }
      if (Object.keys(payload).length === 0) {
        setEditing(false);
        return;
      }
      await updateGame(runId, id, payload);
      toast.success("Game updated!");
      setEditing(false);
      fetchGame();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to update game");
    }
  };


  const handleVote = async (voteType, nomineeId) => {
    try {
      await castVote(runId, id, { vote_type: voteType, nominee_id: nomineeId });
      const labels = { mvp: "MVP", shaqtin: "Shaqtin'", xfactor: "X Factor" };
      toast.success(`${labels[voteType] || voteType} vote recorded!`);
      const [awardsRes, votesRes] = await Promise.all([
        getGameAwards(runId, id),
        getMyVotes(runId, id),
      ]);
      setAwards(awardsRes.data);
      setMyVotes(votesRes.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Vote failed");
    }
  };

  if (!currentRun) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center">
        <p className="text-gray-500 dark:text-gray-400">Please select a Run from the dropdown above.</p>
      </div>
    );
  }

  if (loading) return <div className="max-w-4xl mx-auto px-4 py-8">Loading...</div>;
  if (!game) return <div className="max-w-4xl mx-auto px-4 py-8">Game not found</div>;

  const myRsvp = game.rsvps?.find((r) => r.user_id === user?.id);
  const allParticipants = game.teams?.map((t) => t.user).filter(Boolean) || [];
  const isParticipant = game.teams?.some((t) => t.user_id === user?.id);

  // Get unique teams for result recording buttons
  const uniqueTeams = [];
  const seenTeams = new Set();
  for (const t of game.teams || []) {
    if (!seenTeams.has(t.team)) {
      seenTeams.add(t.team);
      uniqueTeams.push({ id: t.team, name: t.team_name || t.team });
    }
  }

  // Team panel colors matching NbaJamTeams
  const TEAM_COLORS = [
    "#f97316", "#3b82f6", "#10b981", "#a855f7",
    "#ef4444", "#eab308", "#06b6d4", "#ec4899",
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Game Header */}
      <div className="card mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{game.title}</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          {new Date(game.game_date).toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
        <p className="text-gray-500 dark:text-gray-400">{game.location}</p>
        <div className="flex items-center gap-4 mt-4">
          <span className="text-sm font-medium">
            {game.accepted_count}/{game.roster_size} players
          </span>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {game.num_teams} teams
          </span>
          <span className={`badge ${
            game.status === "cancelled" ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
          }`}>
            {game.status.replace("_", " ")}
          </span>
        </div>
        {game.notes && <p className="text-gray-600 dark:text-gray-400 mt-4 italic">{game.notes}</p>}
      </div>

      {/* Final Score Banner */}
      {game.status === "completed" && game.result?.team_scores?.length > 0 && (
        <div className="card mb-6 border-2 border-court-300 dark:border-court-700 bg-court-50 dark:bg-court-900/20">
          <h3 className="text-sm font-semibold text-court-600 uppercase tracking-wide text-center mb-2">Final Score</h3>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            {[...game.result.team_scores]
              .sort((a, b) => b.wins - a.wins)
              .map((ts, idx) => (
                <div key={ts.team} className="flex items-center gap-2">
                  {idx > 0 && <span className="text-gray-400 dark:text-gray-500 font-bold">-</span>}
                  <span className="font-bold text-gray-800 dark:text-gray-200">{ts.team_name}</span>
                  <span className="text-2xl font-black text-court-600">{ts.wins}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Game Commentary */}
      {game.commentary && (
        <div className="card mb-6 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
          <div className="space-y-2">
            {game.commentary.split("\n").map((line, i) => (
              <p key={i} className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                {line}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Cancelled Banner */}
      {game.status === "cancelled" && (
        <div className="card mb-6 border-2 border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20">
          <p className="text-red-700 font-semibold text-center">
            This game has been cancelled.
          </p>
        </div>
      )}

      {/* Skipped Banner */}
      {game.status === "skipped" && (
        <div className="card mb-6 border-2 border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20">
          <p className="text-yellow-700 font-semibold text-center">
            This game has been skipped.
          </p>
          {game.notes && <p className="text-yellow-600 text-sm text-center mt-1">{game.notes}</p>}
        </div>
      )}

      {/* Award Results — compact chips (shown after voting closes) */}
      {awards && !awards.voting_open && (awards.mvp || awards.shaqtin || awards.xfactor) && (
        <div className="flex flex-wrap items-center gap-2 mb-6">
          {awards.mvp && (
            <Link to={`/players/${awards.mvp.player.id}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20 hover:bg-yellow-100 dark:hover:bg-yellow-900/40 transition-colors">
              <span>🏆</span>
              <span className="text-sm font-bold text-yellow-800 dark:text-yellow-300">{awards.mvp.player.full_name}</span>
              <span className="text-xs text-yellow-600 dark:text-yellow-500">{awards.mvp.vote_count}v</span>
            </Link>
          )}
          {awards.xfactor && (
            <Link to={`/players/${awards.xfactor.player.id}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
              <span>⚡</span>
              <span className="text-sm font-bold text-blue-800 dark:text-blue-300">{awards.xfactor.player.full_name}</span>
              <span className="text-xs text-blue-600 dark:text-blue-500">{awards.xfactor.vote_count}v</span>
            </Link>
          )}
          {awards.shaqtin && (
            <Link to={`/players/${awards.shaqtin.player.id}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors">
              <span>🤦</span>
              <span className="text-sm font-bold text-purple-800 dark:text-purple-300">{awards.shaqtin.player.full_name}</span>
              <span className="text-xs text-purple-600 dark:text-purple-500">{awards.shaqtin.vote_count}v</span>
            </Link>
          )}
        </div>
      )}

      {/* Voting Section (shown for participants when voting is open) */}
      {game.status === "completed" && awards?.voting_open && isParticipant && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Cast Your Votes</h2>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Closes {new Date(awards.voting_deadline).toLocaleString("en-US", {
                month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
              })}
            </span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {awards.votes_cast} of {awards.total_voters} participants have voted.
            Results are hidden until voting closes.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <VotingCard
              title="MVP"
              emoji="🏆"
              description="Who had the best game?"
              color="yellow"
              participants={allParticipants}
              currentUserId={user?.id}
              currentVoteId={myVotes?.mvp_vote?.nominee_id}
              onVote={(nomineeId) => handleVote("mvp", nomineeId)}
            />
            <VotingCard
              title="X Factor"
              emoji="⚡"
              description="Who was the biggest game-changer?"
              color="blue"
              participants={allParticipants}
              currentUserId={user?.id}
              currentVoteId={myVotes?.xfactor_vote?.nominee_id}
              onVote={(nomineeId) => handleVote("xfactor", nomineeId)}
            />
            <VotingCard
              title="Shaqtin' a Fool"
              emoji="🤦"
              description="Who had the worst play?"
              color="purple"
              participants={allParticipants}
              currentUserId={user?.id}
              currentVoteId={myVotes?.shaqtin_vote?.nominee_id}
              onVote={(nomineeId) => handleVote("shaqtin", nomineeId)}
            />
          </div>
        </div>
      )}

      {/* Voting closed message */}
      {game.status === "completed" && awards && !awards.voting_open && isParticipant && (
        <div className="text-center text-sm text-gray-500 dark:text-gray-400 mb-6">
          Voting has closed. {awards.votes_cast} of {awards.total_voters} participants voted.
        </div>
      )}

      {/* RSVP Section */}
      {game.status !== "completed" && game.status !== "cancelled" && game.status !== "skipped" && (
        <div className="card mb-6">
          <h2 className="text-lg font-semibold mb-3">Your RSVP</h2>
          {myRsvp ? (
            <div className="flex items-center gap-4">
              <span className={`badge ${
                myRsvp.status === "accepted" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" :
                myRsvp.status === "declined" ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" :
                "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"
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

      {/* Teams Display — NBA Jam Style or Team Editor */}
      {game.teams?.length > 0 && (
        <div className="mb-6">
          {editingTeams ? (
            <TeamEditor
              teams={game.teams}
              runId={runId}
              gameId={id}
              onSave={() => { setEditingTeams(false); fetchGame(); }}
              onCancel={() => { setEditingTeams(false); fetchGame(); }}
            />
          ) : (
            <NbaJamTeams teams={game.teams} gameResult={game.result} />
          )}
        </div>
      )}

      {/* RSVP List — hidden on completed games for non-admins */}
      {(game.status !== "completed" || user?.role === "super_admin" || user?.role === "admin") && (
        <div className="card mb-6">
          <h2 className="text-lg font-semibold mb-3">RSVPs ({game.rsvps?.length || 0})</h2>
          {game.rsvps?.length > 0 ? (
            <div className="space-y-2">
              {game.rsvps.map((rsvp) => (
                <div key={rsvp.id} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                  <span className="font-medium">{rsvp.user?.full_name || `Player #${rsvp.user_id}`}</span>
                  <span className={`badge ${
                    rsvp.status === "accepted" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" :
                    rsvp.status === "declined" ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" :
                    rsvp.status === "waitlist" ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" :
                    "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"
                  }`}>
                    {rsvp.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 dark:text-gray-400">No RSVPs yet.</p>
          )}
        </div>
      )}

      {/* Admin Actions */}
      {(user?.role === "super_admin" || user?.role === "admin") && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-3">Admin Actions</h2>

          {/* Edit Game Form */}
          {editing ? (
            <div className="space-y-3 mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Edit Game Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Title</label>
                  <input
                    type="text"
                    value={editForm.title}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    className="input text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Date & Time</label>
                  <input
                    type="datetime-local"
                    value={editForm.game_date}
                    onChange={(e) => setEditForm({ ...editForm, game_date: e.target.value })}
                    className="input text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Location</label>
                  <input
                    type="text"
                    value={editForm.location}
                    onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                    className="input text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Notes</label>
                  <input
                    type="text"
                    value={editForm.notes}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    className="input text-sm"
                    placeholder="Optional notes"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleSaveEdit} className="btn-primary text-sm py-1.5 px-4">Save Changes</button>
                <button onClick={() => setEditing(false)} className="btn-secondary text-sm py-1.5 px-4">Cancel</button>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            {/* Edit Game */}
            {game.status !== "completed" && game.status !== "cancelled" && game.status !== "skipped" && (
              <button onClick={handleStartEdit} className="bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold py-2 px-4 rounded-lg">
                Edit Game
              </button>
            )}

            {/* Generate / Regenerate Teams */}
            {game.status !== "completed" && game.status !== "cancelled" && game.status !== "skipped" && (
              <button onClick={handleGenerateTeams} className="btn-primary">
                {game.status === "teams_set" ? "Regenerate Teams" : "Generate Teams"}
              </button>
            )}

            {/* Edit Teams (drag-and-drop) */}
            {game.status === "teams_set" && !editingTeams && (
              <button
                onClick={() => setEditingTeams(true)}
                className="bg-cyan-600 hover:bg-cyan-700 text-white font-semibold py-2 px-4 rounded-lg"
              >
                Edit Teams
              </button>
            )}

            {/* Record Scores — input per team */}
            {game.status === "teams_set" && !editingTeams && uniqueTeams.length > 0 && (
              <div className="w-full mt-2">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Record wins per team:</p>
                <div className="flex flex-wrap items-end gap-3">
                  {uniqueTeams.map((team, idx) => (
                    <div key={team.id} className="flex flex-col items-center">
                      <label
                        className="text-xs font-bold mb-1 px-2 py-0.5 rounded text-white"
                        style={{ backgroundColor: TEAM_COLORS[idx % TEAM_COLORS.length] }}
                      >
                        {team.name}
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={scores[team.id] || ""}
                        onChange={(e) => setScores({ ...scores, [team.id]: e.target.value })}
                        placeholder="0"
                        className="w-16 text-center text-lg font-bold border-2 border-gray-300 dark:border-gray-600 rounded-lg py-1 focus:border-court-500 focus:outline-none dark:bg-gray-900 dark:text-gray-100"
                      />
                    </div>
                  ))}
                  <button
                    onClick={handleRecordResult}
                    className="btn-primary py-2 px-4"
                  >
                    Submit Scores
                  </button>
                </div>
                <textarea
                  value={gameCommentary}
                  onChange={(e) => setGameCommentary(e.target.value)}
                  placeholder="Game commentary (optional)"
                  rows={2}
                  className="w-full mt-3 text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 dark:bg-gray-900 dark:text-gray-100"
                />
              </div>
            )}

            {/* Cancel Game */}
            {game.status !== "completed" && game.status !== "cancelled" && game.status !== "skipped" && (
              <button
                onClick={handleCancelGame}
                className="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg"
              >
                Cancel Game
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * VotingCard Component
 */
function VotingCard({ title, emoji, description, color, participants, currentUserId, currentVoteId, onVote }) {
  const colorMap = {
    yellow: { border: "border-yellow-300 dark:border-yellow-700", header: "text-yellow-700", selected: "bg-yellow-100 dark:bg-yellow-900/30 border-yellow-400 dark:border-yellow-600" },
    purple: { border: "border-purple-300 dark:border-purple-700", header: "text-purple-700", selected: "bg-purple-100 dark:bg-purple-900/30 border-purple-400 dark:border-purple-600" },
    blue: { border: "border-blue-300 dark:border-blue-700", header: "text-blue-700", selected: "bg-blue-100 dark:bg-blue-900/30 border-blue-400 dark:border-blue-600" },
  };
  const colors = colorMap[color] || colorMap.yellow;
  const borderColor = colors.border;
  const headerColor = colors.header;
  const selectedBg = colors.selected;

  const eligible = participants.filter((p) => p.id !== currentUserId);

  return (
    <div className={`border-2 ${borderColor} rounded-xl p-4`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xl">{emoji}</span>
        <h3 className={`font-bold ${headerColor}`}>{title}</h3>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{description}</p>

      <div className="space-y-2">
        {eligible.map((player) => {
          const isSelected = currentVoteId === player.id;
          return (
            <button
              key={player.id}
              onClick={() => onVote(player.id)}
              className={`w-full text-left px-3 py-2 rounded-lg border-2 transition-all text-sm ${
                isSelected
                  ? `${selectedBg} font-semibold`
                  : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
              }`}
            >
              <div className="flex items-center justify-between">
                <span>{player.full_name}</span>
                {isSelected && <span className="text-xs">Your vote</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
