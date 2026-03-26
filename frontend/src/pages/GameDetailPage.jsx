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
import { getGame, updateGame, rsvpToGame, generateTeams, recordResult, cancelGame, adminRsvp } from "../api/games";
import { listPlayers } from "../api/players";
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
  const [isRunMember, setIsRunMember] = useState(false);
  const [completing, setCompleting] = useState(false);

  const fetchGame = async () => {
    if (!runId) return;
    try {
      const { data } = await getGame(runId, id);
      setGame(data);

      // Check if user has an RSVP (= is a member)
      const hasRsvp = data.rsvps?.some((r) => r.user_id === user?.id);
      if (hasRsvp) {
        setIsRunMember(true);
      } else {
        // Check player list for membership
        try {
          const pRes = await listPlayers(runId, { search: user?.username });
          setIsRunMember(pRes.data.users?.some((p) => p.id === user?.id) || false);
        } catch {
          setIsRunMember(false);
        }
      }

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

  const isAdminUser = user?.role === "super_admin" || user?.role === "admin";
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
          {(user?.role === "super_admin" || user?.role === "admin") ? (
            <select
              value={game.status}
              onChange={async (e) => {
                const newStatus = e.target.value;
                if (game.status === "completed" && newStatus !== "completed") {
                  if (!confirm("Changing from completed will remove the game results and commentary. Continue?")) {
                    e.target.value = game.status;
                    return;
                  }
                }
                try {
                  await updateGame(runId, id, { status: newStatus });
                  toast.success(`Status → ${newStatus.replace("_", " ")}`);
                  fetchGame();
                } catch (err) {
                  toast.error(err.response?.data?.detail || "Failed to change status");
                }
              }}
              className="text-sm font-semibold border rounded-lg px-2 py-1 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 cursor-pointer"
            >
              {["scheduled", "invites_sent", "dropin_open", "teams_set", "completed", "cancelled", "skipped"].map((s) => (
                <option key={s} value={s}>{s.replace("_", " ")}</option>
              ))}
            </select>
          ) : (
            <span className={`badge ${
              game.status === "cancelled" ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
            }`}>
              {game.status.replace("_", " ")}
            </span>
          )}
        </div>
        {game.notes && <p className="text-gray-600 dark:text-gray-400 mt-4 italic">{game.notes}</p>}

        {/* Admin inline actions */}
        {isAdminUser && game.status !== "completed" && game.status !== "cancelled" && game.status !== "skipped" && (
          <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
            <button onClick={handleStartEdit} className="text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium py-1.5 px-3 rounded-lg">
              Edit Game
            </button>
            {game.status === "teams_set" && (
              <button onClick={() => setCompleting(true)} className="text-sm bg-green-600 hover:bg-green-500 text-white font-medium py-1.5 px-3 rounded-lg">
                Complete Game
              </button>
            )}
            <button onClick={handleCancelGame} className="text-sm bg-red-500/10 hover:bg-red-500/20 text-red-500 font-medium py-1.5 px-3 rounded-lg">
              Cancel Game
            </button>
          </div>
        )}

        {/* Edit Game Form (inline in header) */}
        {editing && isAdminUser && (
          <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Title</label>
                <input type="text" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} className="input text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Date & Time</label>
                <input type="datetime-local" value={editForm.game_date} onChange={(e) => setEditForm({ ...editForm, game_date: e.target.value })} className="input text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Location</label>
                <input type="text" value={editForm.location} onChange={(e) => setEditForm({ ...editForm, location: e.target.value })} className="input text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Notes</label>
                <input type="text" value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} className="input text-sm" placeholder="Optional notes" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleSaveEdit} className="btn-primary text-sm py-1.5 px-4">Save</button>
              <button onClick={() => setEditing(false)} className="btn-secondary text-sm py-1.5 px-4">Cancel</button>
            </div>
          </div>
        )}

        {/* Complete Game Form (inline in header) */}
        {completing && isAdminUser && game.status === "teams_set" && uniqueTeams.length > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Record Results</h3>
            <div className="flex flex-wrap items-end gap-3">
              {uniqueTeams.map((team, idx) => (
                <div key={team.id} className="flex flex-col items-center">
                  <label className="text-xs font-bold mb-1 px-2 py-0.5 rounded text-white" style={{ backgroundColor: TEAM_COLORS[idx % TEAM_COLORS.length] }}>
                    {team.name}
                  </label>
                  <input
                    type="number" min="0"
                    value={scores[team.id] || ""}
                    onChange={(e) => setScores({ ...scores, [team.id]: e.target.value })}
                    placeholder="0"
                    className="w-16 text-center text-lg font-bold border-2 border-gray-300 dark:border-gray-600 rounded-lg py-1 focus:border-court-500 focus:outline-none dark:bg-gray-900 dark:text-gray-100"
                  />
                </div>
              ))}
            </div>
            <textarea
              value={gameCommentary}
              onChange={(e) => setGameCommentary(e.target.value)}
              placeholder="Game commentary (optional)"
              rows={2}
              className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 dark:bg-gray-900 dark:text-gray-100"
            />
            <div className="flex gap-2">
              <button onClick={handleRecordResult} className="btn-primary text-sm py-1.5 px-4">Submit & Complete</button>
              <button onClick={() => setCompleting(false)} className="btn-secondary text-sm py-1.5 px-4">Cancel</button>
            </div>
          </div>
        )}
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

      {/* Player Award Voting (shown for participants when voting is open) */}
      {game.status === "completed" && awards?.voting_open && isParticipant && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Player Award Voting</h2>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Closes {new Date(awards.voting_deadline).toLocaleString("en-US", {
                month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
              })}
            </span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {awards.votes_cast} of {awards.total_voters} participants have voted.
            Results are hidden until award voting closes.
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

      {/* Award voting closed message */}
      {game.status === "completed" && awards && !awards.voting_open && isParticipant && (
        <div className="text-center text-sm text-gray-500 dark:text-gray-400 mb-6">
          Player award voting has closed. {awards.votes_cast} of {awards.total_voters} participants voted.
        </div>
      )}

      {/* RSVP Section — hidden for non-active games and non-members */}
      {game.status !== "completed" && game.status !== "cancelled" && game.status !== "skipped" && isRunMember && (
        <div className="card mb-6">
          <h2 className="text-lg font-semibold mb-3">Your RSVP</h2>
          {myRsvp ? (
            <div className="flex items-center gap-4">
              <span className={`badge ${
                myRsvp.status === "accepted" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                myRsvp.status === "declined" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                myRsvp.status === "waitlist" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" :
                "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
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

      {/* Generate Teams button — shown for admins when no teams exist yet */}
      {!game.teams?.length && (user?.role === "super_admin" || user?.role === "admin") &&
        game.status !== "completed" && game.status !== "cancelled" && game.status !== "skipped" && (
        <div className="card mb-6 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">No teams generated yet</p>
          <button onClick={handleGenerateTeams} className="btn-primary">
            Generate Teams
          </button>
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
            <NbaJamTeams
              teams={game.teams}
              gameResult={game.result}
              onEditTeams={game.status === "teams_set" ? () => setEditingTeams(true) : null}
              onGenerateTeams={game.status !== "completed" && game.status !== "cancelled" && game.status !== "skipped" ? handleGenerateTeams : null}
              isTeamsSet={game.status === "teams_set"}
            />
          )}
        </div>
      )}

      {/* RSVP List */}
      {(game.status !== "completed" || isAdminUser) && (
        <RsvpSection
          game={game}
          runId={runId}
          isAdmin={isAdminUser}
          onUpdate={fetchGame}
        />
      )}

      {/* Admin RSVP on behalf */}
      {isAdminUser && (
        <div className="card">
          <AdminRsvpSection runId={runId} gameId={id} onUpdate={fetchGame} />
        </div>
      )}
    </div>
  );
}

/**
 * RsvpSection — Shows RSVP status for all run members (admins) or just existing RSVPs (players).
 * Admins can change any player's RSVP status inline.
 */
function RsvpSection({ game, runId, isAdmin, onUpdate }) {
  const [members, setMembers] = useState([]);
  const { currentRun } = useRunStore();
  const priorityMode = currentRun?.dropin_priority_mode || "fifo";

  useEffect(() => {
    if (!isAdmin || !runId) return;
    listPlayers(runId, { include_inactive: false })
      .then(({ data }) => setMembers(data.users))
      .catch(() => setMembers([]));
  }, [isAdmin, runId]);

  // Build a merged list: all members (admin) or just RSVPs (player)
  const rsvpMap = {};
  for (const r of game.rsvps || []) {
    rsvpMap[r.user_id] = r;
  }

  const rows = isAdmin
    ? members.map((m) => ({
        userId: m.id,
        name: m.full_name,
        playerStatus: m.player_status,
        rsvpStatus: rsvpMap[m.id]?.status || null,
        respondedAt: rsvpMap[m.id]?.responded_at || null,
        dropinPriority: m.dropin_priority ?? 999,
      }))
    : (game.rsvps || []).map((r) => ({
        userId: r.user_id,
        name: r.user?.full_name || `Player #${r.user_id}`,
        playerStatus: r.user?.player_status || null,
        rsvpStatus: r.status,
        respondedAt: r.responded_at,
        dropinPriority: r.user?.dropin_priority ?? 999,
      }));

  // Sort: accepted first, then waitlist, then no-response, then declined
  const rsvpSortOrder = { accepted: 0, waitlist: 1, declined: 3 };
  const playerSortOrder = { regular: 0, dropin: 1, pending: 2, inactive: 3 };
  rows.sort((a, b) => {
    const aRsvp = a.rsvpStatus ? (rsvpSortOrder[a.rsvpStatus] ?? 2) : 2;
    const bRsvp = b.rsvpStatus ? (rsvpSortOrder[b.rsvpStatus] ?? 2) : 2;
    if (aRsvp !== bRsvp) return aRsvp - bRsvp;

    // Within accepted: regulars before drop-ins
    const aPlayer = playerSortOrder[a.playerStatus] ?? 1;
    const bPlayer = playerSortOrder[b.playerStatus] ?? 1;
    if (aPlayer !== bPlayer) return aPlayer - bPlayer;

    // For waitlisted drop-ins: sort by promotion order
    if (a.rsvpStatus === "waitlist" && b.rsvpStatus === "waitlist") {
      if (priorityMode === "admin") {
        // Admin priority first, then response time
        if (a.dropinPriority !== b.dropinPriority) return a.dropinPriority - b.dropinPriority;
      }
      // FIFO: earlier response = higher priority
      if (a.respondedAt && b.respondedAt) return new Date(a.respondedAt) - new Date(b.respondedAt);
    }

    // For non-waitlisted drop-ins with admin priority mode, sort by priority
    if (a.playerStatus === "dropin" && b.playerStatus === "dropin" && priorityMode === "admin") {
      if (a.dropinPriority !== b.dropinPriority) return a.dropinPriority - b.dropinPriority;
    }

    return a.name.localeCompare(b.name);
  });

  const acceptedCount = rows.filter((r) => r.rsvpStatus === "accepted").length;
  const declinedCount = rows.filter((r) => r.rsvpStatus === "declined").length;
  const waitlistCount = rows.filter((r) => r.rsvpStatus === "waitlist").length;
  const pendingCount = rows.filter((r) => !r.rsvpStatus).length;

  // Assign waitlist position numbers (1-based)
  let waitlistPos = 0;
  for (const row of rows) {
    if (row.rsvpStatus === "waitlist") {
      waitlistPos++;
      row.waitlistPosition = waitlistPos;
    }
  }

  const handleAdminRsvp = async (userId, name, status) => {
    try {
      await adminRsvp(runId, game.id, userId, status);
      toast.success(`${name} → ${status}`);
      onUpdate();
    } catch (err) {
      toast.error(err.response?.data?.detail || "RSVP failed");
    }
  };

  const statusBadge = (status) => {
    if (!status) return "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400";
    if (status === "accepted") return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    if (status === "declined") return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    if (status === "waitlist") return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
    return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300";
  };

  return (
    <div className="card mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">
          RSVPs
          <span className="text-sm font-normal text-gray-500 dark:text-gray-400 ml-2">
            {acceptedCount} in{waitlistCount > 0 ? ` · ${waitlistCount} waitlist` : ""}{declinedCount > 0 ? ` · ${declinedCount} out` : ""}{pendingCount > 0 ? ` · ${pendingCount} pending` : ""}
          </span>
        </h2>
      </div>
      {rows.length > 0 ? (
        <div className="space-y-1">
          {rows.map((row) => (
            <div key={row.userId} className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-700 last:border-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{row.name}</span>
                {row.playerStatus === "dropin" && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400">
                    Drop-in
                  </span>
                )}
                {row.rsvpStatus === "waitlist" && row.waitlistPosition && (
                  <span className="text-[10px] font-bold text-yellow-600 dark:text-yellow-400">
                    #{row.waitlistPosition}
                  </span>
                )}
              </div>
              {isAdmin ? (
                <select
                  value={row.rsvpStatus || ""}
                  onChange={(e) => handleAdminRsvp(row.userId, row.name, e.target.value)}
                  className={`text-xs font-semibold border rounded px-2 py-1 cursor-pointer ${
                    !row.rsvpStatus ? "dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600 text-gray-400" :
                    row.rsvpStatus === "accepted" ? "bg-green-50 text-green-700 border-green-300 dark:bg-green-900/20 dark:text-green-400 dark:border-green-700" :
                    row.rsvpStatus === "declined" ? "bg-red-50 text-red-700 border-red-300 dark:bg-red-900/20 dark:text-red-400 dark:border-red-700" :
                    "bg-yellow-50 text-yellow-700 border-yellow-300 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-700"
                  }`}
                >
                  <option value="" disabled>No response</option>
                  <option value="accepted">Accepted</option>
                  <option value="declined">Declined</option>
                  <option value="waitlist">Waitlist</option>
                </select>
              ) : (
                <span className={`badge ${statusBadge(row.rsvpStatus)}`}>
                  {row.rsvpStatus || "no response"}
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-gray-500 dark:text-gray-400">No players in this run yet.</p>
      )}
    </div>
  );
}


/**
 * AdminRsvpSection — Allows admin to RSVP on behalf of players.
 */
function AdminRsvpSection({ runId, gameId, onUpdate }) {
  const [showRsvp, setShowRsvp] = useState(false);
  const [players, setPlayers] = useState([]);
  const [search, setSearch] = useState("");
  const [rsvpStatus, setRsvpStatus] = useState("accepted");

  useEffect(() => {
    if (!showRsvp || !runId) return;
    listPlayers(runId, { include_inactive: true })
      .then(({ data }) => setPlayers(data.users))
      .catch(() => setPlayers([]));
  }, [showRsvp, runId]);

  const filtered = players.filter((p) =>
    p.full_name.toLowerCase().includes(search.toLowerCase())
  );

  const handleRsvp = async (userId, name) => {
    try {
      await adminRsvp(runId, gameId, userId, rsvpStatus);
      toast.success(`${name} → ${rsvpStatus}`);
      onUpdate();
    } catch (err) {
      toast.error(err.response?.data?.detail || "RSVP failed");
    }
  };

  if (!showRsvp) {
    return (
      <button onClick={() => setShowRsvp(true)} className="text-sm text-cyan-500 hover:text-cyan-400 font-medium">
        + RSVP on behalf of a player
      </button>
    );
  }

  return (
    <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Admin RSVP</h3>
        <button onClick={() => setShowRsvp(false)} className="text-gray-400 hover:text-white text-lg leading-none">&times;</button>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <input type="text" placeholder="Search player..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="flex-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 dark:bg-gray-800 dark:text-gray-100" />
        <select value={rsvpStatus} onChange={(e) => setRsvpStatus(e.target.value)}
          className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 dark:bg-gray-800 dark:text-gray-200">
          <option value="accepted">Accept</option>
          <option value="declined">Decline</option>
          <option value="waitlist">Waitlist</option>
        </select>
      </div>
      {search && (
        <div className="max-h-32 overflow-y-auto space-y-1">
          {filtered.slice(0, 8).map((p) => (
            <button key={p.id} onClick={() => handleRsvp(p.id, p.full_name)}
              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-left text-sm">
              <span className="font-medium text-gray-800 dark:text-gray-200">{p.full_name}</span>
              <span className="text-xs text-gray-400 ml-auto">{p.player_status}</span>
            </button>
          ))}
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
