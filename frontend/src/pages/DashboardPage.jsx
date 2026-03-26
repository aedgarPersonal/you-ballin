/**
 * Dashboard Page
 * ==============
 * Landing page after login showing upcoming game with RSVP,
 * last completed game with results/voting, and quick actions.
 */

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import useAuthStore from "../stores/authStore";
import useRunStore from "../stores/runStore";
import { listGames, getGame, rsvpToGame } from "../api/games";
import { listPlayers } from "../api/players";
import { getRecentAwards, getGameAwards, getMyVotes, castVote } from "../api/votes";
import { AvatarBadge } from "../components/AvatarPicker";
import { getPlayerById } from "../data/legacyPlayers";

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { currentRun } = useRunStore();
  const runId = currentRun?.id;
  const [nextGame, setNextGame] = useState(null);
  const [lastCompleted, setLastCompleted] = useState(null);
  const [lastAwards, setLastAwards] = useState(null);
  const [myVotes, setMyVotes] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isRunMember, setIsRunMember] = useState(false);

  const fetchData = async () => {
    if (!runId) { setLoading(false); return; }
    try {
      const gamesRes = await listGames(runId);
      const games = gamesRes.data;

      // Find next upcoming game (not completed/cancelled/skipped)
      const upcoming = games.find(
        (g) => !["completed", "cancelled", "skipped"].includes(g.status)
      );
      if (upcoming) {
        // Fetch full detail to get RSVPs
        const { data } = await getGame(runId, upcoming.id);
        setNextGame(data);

        // Check run membership
        const hasRsvp = data.rsvps?.some((r) => r.user_id === user?.id);
        if (hasRsvp) {
          setIsRunMember(true);
        } else {
          try {
            const pRes = await listPlayers(runId, { search: user?.username });
            setIsRunMember(pRes.data.users?.some((p) => p.id === user?.id) || false);
          } catch { setIsRunMember(false); }
        }
      }

      // Find most recent completed game
      const completed = games.find((g) => g.status === "completed");
      if (completed) {
        const [gameRes, awardsRes, votesRes] = await Promise.allSettled([
          getGame(runId, completed.id),
          getGameAwards(runId, completed.id),
          getMyVotes(runId, completed.id),
        ]);
        if (gameRes.status === "fulfilled") setLastCompleted(gameRes.value.data);
        if (awardsRes.status === "fulfilled") setLastAwards(awardsRes.value.data);
        if (votesRes.status === "fulfilled") setMyVotes(votesRes.value.data);
      }
    } catch {
      // User may be pending
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [runId]);

  const handleRsvp = async (status) => {
    if (!nextGame) return;
    try {
      await rsvpToGame(runId, nextGame.id, status);
      toast.success(status === "accepted" ? "You're in!" : "RSVP updated");
      const { data } = await getGame(runId, nextGame.id);
      setNextGame(data);
    } catch (err) {
      toast.error(err.response?.data?.detail || "RSVP failed");
    }
  };

  const handleVote = async (voteType, nomineeId) => {
    if (!lastCompleted || !nomineeId) return;
    try {
      await castVote(runId, lastCompleted.id, { vote_type: voteType, nominee_id: parseInt(nomineeId) });
      toast.success("Vote recorded!");
      const [awardsRes, votesRes] = await Promise.all([
        getGameAwards(runId, lastCompleted.id),
        getMyVotes(runId, lastCompleted.id),
      ]);
      setLastAwards(awardsRes.data);
      setMyVotes(votesRes.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Vote failed");
    }
  };

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

  const myRsvp = nextGame?.rsvps?.find((r) => r.user_id === user?.id);
  const isParticipant = lastCompleted?.teams?.some((t) => t.user_id === user?.id);
  const allParticipants = lastCompleted?.teams?.map((t) => t.user).filter(Boolean) || [];
  const eligibleForVote = allParticipants.filter((p) => p.id !== user?.id);

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
          {isRunMember && (
            <p className="text-gray-600 dark:text-gray-400 mt-1">{statusMessage[user?.player_status] || ""}</p>
          )}
          {!isRunMember && user?.role === "super_admin" && (
            <p className="text-gray-600 dark:text-gray-400 mt-1">Managing as Super Admin</p>
          )}
          {user?.avatar_url && getPlayerById(user.avatar_url) && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              Repping {getPlayerById(user.avatar_url).name} — {getPlayerById(user.avatar_url).team}
            </p>
          )}
        </div>
      </div>

      {/* Status Cards — only for run members */}
      {isRunMember && (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="card">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Your Status</h3>
          <div className="mt-2 flex items-center gap-2">
            <span className={`badge-${user?.player_status}`}>{user?.player_status}</span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {user?.role === "super_admin" && "(Super Admin)"}
            </span>
          </div>
        </div>
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
      </div>)}

      {/* Next Game with RSVP */}
      <div className="card mb-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Next Game</h2>
        {loading ? (
          <p className="text-gray-500 dark:text-gray-400">Loading...</p>
        ) : nextGame ? (
          <div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">{nextGame.title}</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  {new Date(nextGame.game_date).toLocaleDateString("en-US", {
                    weekday: "long", month: "long", day: "numeric",
                    hour: "numeric", minute: "2-digit",
                  })}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {nextGame.location} &middot; {nextGame.accepted_count}/{nextGame.roster_size} players
                </p>
                <span className={`badge mt-2 inline-block ${
                  nextGame.status === "teams_set" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" :
                  nextGame.status === "dropin_open" ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" :
                  "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                }`}>
                  {nextGame.status.replace("_", " ")}
                </span>
              </div>
              <Link to={`/games/${nextGame.id}`} className="text-sm text-court-600 hover:text-court-700 font-medium">
                View Details &rarr;
              </Link>
            </div>

            {/* RSVP Action — only for run members */}
            {nextGame.status !== "teams_set" && isRunMember && (
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                {myRsvp ? (
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500 dark:text-gray-400">Your RSVP:</span>
                    <span className={`badge ${
                      myRsvp.status === "accepted" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" :
                      myRsvp.status === "declined" ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" :
                      "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"
                    }`}>{myRsvp.status}</span>
                    {myRsvp.status !== "accepted" && (
                      <button onClick={() => handleRsvp("accepted")} className="btn-primary text-sm py-1.5 px-3">
                        I'm In!
                      </button>
                    )}
                    {myRsvp.status !== "declined" && (
                      <button onClick={() => handleRsvp("declined")} className="btn-secondary text-sm py-1.5 px-3">
                        Can't Make It
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500 dark:text-gray-400">Are you playing?</span>
                    <button onClick={() => handleRsvp("accepted")} className="btn-primary text-sm py-1.5 px-4">
                      I'm In!
                    </button>
                    <button onClick={() => handleRsvp("declined")} className="btn-secondary text-sm py-1.5 px-4">
                      Can't Make It
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="text-gray-500 dark:text-gray-400">No upcoming games scheduled.</p>
        )}
      </div>

      {/* Last Completed Game */}
      {lastCompleted && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Last Game</h2>
            <Link to={`/games/${lastCompleted.id}`} className="text-sm text-court-600 hover:text-court-700 font-medium">
              View Details &rarr;
            </Link>
          </div>

          <h3 className="font-semibold text-gray-800 dark:text-gray-200">{lastCompleted.title}</h3>

          {/* Score */}
          {lastCompleted.result?.team_scores?.length > 0 && (
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {[...lastCompleted.result.team_scores]
                .sort((a, b) => b.wins - a.wins)
                .map((ts, idx) => (
                  <div key={ts.team} className="flex items-center gap-1">
                    {idx > 0 && <span className="text-gray-400 font-bold mr-1">-</span>}
                    <span className="font-medium text-gray-700 dark:text-gray-300">{ts.team_name}</span>
                    <span className="text-xl font-black text-court-600">{ts.wins}</span>
                  </div>
                ))}
            </div>
          )}

          {/* Commentary */}
          {lastCompleted.commentary && (
            <p className="text-sm text-gray-600 dark:text-gray-400 italic mt-3">{lastCompleted.commentary}</p>
          )}

          {/* Voting (dropdowns) or Award Results */}
          {lastAwards && (
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
              {lastAwards.voting_open && isParticipant ? (
                <>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Cast your votes ({lastAwards.votes_cast}/{lastAwards.total_voters} voted)
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <VoteDropdown
                      label="MVP"
                      emoji="🏆"
                      voteType="mvp"
                      players={eligibleForVote}
                      currentVoteId={myVotes?.mvp_vote?.nominee_id}
                      onVote={handleVote}
                    />
                    <VoteDropdown
                      label="X Factor"
                      emoji="⚡"
                      voteType="xfactor"
                      players={eligibleForVote}
                      currentVoteId={myVotes?.xfactor_vote?.nominee_id}
                      onVote={handleVote}
                    />
                    <VoteDropdown
                      label="Shaqtin'"
                      emoji="🤦"
                      voteType="shaqtin"
                      players={eligibleForVote}
                      currentVoteId={myVotes?.shaqtin_vote?.nominee_id}
                      onVote={handleVote}
                    />
                  </div>
                </>
              ) : !lastAwards.voting_open ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <AwardCard label="MVP" emoji="🏆" winner={lastAwards.mvp}
                    gradient="from-yellow-50 to-amber-50" border="border-yellow-300"
                    labelColor="text-yellow-700" nameColor="text-yellow-900" />
                  <AwardCard label="X Factor" emoji="⚡" winner={lastAwards.xfactor}
                    gradient="from-blue-50 to-indigo-50" border="border-blue-300"
                    labelColor="text-blue-700" nameColor="text-blue-900" />
                  <AwardCard label="Shaqtin'" emoji="🤦" winner={lastAwards.shaqtin}
                    gradient="from-purple-50 to-fuchsia-50" border="border-purple-300"
                    labelColor="text-purple-700" nameColor="text-purple-900" />
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Voting is open. {lastAwards.votes_cast}/{lastAwards.total_voters} participants have voted.
                </p>
              )}
            </div>
          )}
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
 * VoteDropdown — dropdown select for casting a vote on the dashboard.
 */
function VoteDropdown({ label, emoji, voteType, players, currentVoteId, onVote }) {
  return (
    <div>
      <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">
        {emoji} {label}
      </label>
      <select
        value={currentVoteId || ""}
        onChange={(e) => onVote(voteType, e.target.value)}
        className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 dark:bg-gray-800 dark:text-gray-100 focus:border-court-500 focus:outline-none"
      >
        <option value="">Select player...</option>
        {players.map((p) => (
          <option key={p.id} value={p.id}>{p.full_name}</option>
        ))}
      </select>
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
