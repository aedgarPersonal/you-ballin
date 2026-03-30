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
import { getPlayerForm } from "../api/stats";
import { AvatarBadge } from "../components/AvatarPicker";
import { getPlayerById } from "../data/legacyPlayers";
import { playSuccess, playBuzzer } from "../utils/retroSounds";

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
  const [myForm, setMyForm] = useState(null);

  const fetchData = async () => {
    if (!runId) { setLoading(false); return; }
    try {
      // Step 1: Fetch games list, membership, and form in parallel
      const [gamesRes, memberRes, formRes] = await Promise.allSettled([
        listGames(runId),
        listPlayers(runId, { search: user?.username }),
        user?.id ? getPlayerForm(runId, user.id) : Promise.resolve(null),
      ]);

      if (memberRes.status === "fulfilled" && memberRes.value) {
        setIsRunMember(memberRes.value.data.users?.some((p) => p.id === user?.id) || false);
      }
      if (formRes.status === "fulfilled" && formRes.value) {
        setMyForm(formRes.value.data);
      }
      if (gamesRes.status !== "fulfilled") { setLoading(false); return; }

      const games = gamesRes.value.data;
      const now = new Date();

      // Next game: soonest active game from today onwards
      const activeGames = games
        .filter((g) => !["completed", "cancelled", "skipped"].includes(g.status) && new Date(g.game_date) >= new Date(now.toDateString()))
        .sort((a, b) => new Date(a.game_date) - new Date(b.game_date));
      const upcoming = activeGames[0] || null;

      // Last game: most recent completed game on or before today
      const completed = games
        .filter((g) => g.status === "completed" && new Date(g.game_date) <= now)
        .sort((a, b) => new Date(b.game_date) - new Date(a.game_date))[0] || null;

      // Step 2: Fetch game details in parallel
      const detailFetches = [];
      detailFetches.push(upcoming ? getGame(runId, upcoming.id) : Promise.resolve(null));
      if (completed) {
        detailFetches.push(getGame(runId, completed.id));
        detailFetches.push(getGameAwards(runId, completed.id));
        detailFetches.push(getMyVotes(runId, completed.id));
      }

      const results = await Promise.allSettled(detailFetches);

      if (results[0]?.status === "fulfilled" && results[0].value) {
        const gameData = results[0].value.data;
        setNextGame(gameData);
        if (gameData.rsvps?.some((r) => r.user_id === user?.id)) setIsRunMember(true);
      }
      if (completed) {
        if (results[1]?.status === "fulfilled") setLastCompleted(results[1].value.data);
        if (results[2]?.status === "fulfilled") setLastAwards(results[2].value.data);
        if (results[3]?.status === "fulfilled") setMyVotes(results[3].value.data);
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
      playBuzzer();
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
      playSuccess();
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
        <p className="text-gray-400">Please select a Run from the dropdown above.</p>
      </div>
    );
  }

  const isPending = user?.player_status === "pending";
  const isInactive = user?.player_status === "inactive";
  const isNonPlayer = !isRunMember && user?.role !== "super_admin" && user?.role !== "admin";

  // Gate: pending or inactive users see a limited view
  if (isPending || isInactive) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex items-center gap-4">
          {user?.avatar_url && (
            <AvatarBadge avatarId={user.avatar_url} size="lg" />
          )}
          <div>
            <h1 className="text-3xl font-bold text-gray-100">
              Welcome, {user?.full_name?.split(" ")[0]}!
            </h1>
            {currentRun && (
              <p className="text-sm font-medium text-court-600 mt-0.5">{currentRun.name}</p>
            )}
          </div>
        </div>
        <div className="card text-center py-12">
          <div className="text-5xl mb-4">{isPending ? "⏳" : "🔒"}</div>
          <h2 className="text-xl font-bold text-gray-100 mb-2">
            {isPending ? "Registration Pending" : "Account Inactive"}
          </h2>
          <p className="text-gray-400 max-w-md mx-auto">
            {isPending
              ? "Your registration is being reviewed by an admin. You'll be notified once you're approved!"
              : "Your account is currently inactive. Please contact an admin for assistance."}
          </p>
        </div>
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
      {/* Welcome Section — retro header */}
      <div className="mb-8 flex items-center gap-4">
        {user?.avatar_url ? (
          <Link to={`/players/${user?.id}`}>
            <div className="rounded-xl bg-gradient-to-b from-amber-300 via-yellow-400 to-amber-500 p-[2px]">
              <div className="rounded-[10px] bg-gray-950 p-1.5">
                <AvatarBadge avatarId={user.avatar_url} size="lg" />
              </div>
            </div>
          </Link>
        ) : null}
        <div>
          <h1 className="font-retro text-base text-gray-100">
            {user?.full_name?.split(" ")[0]?.toUpperCase()}
          </h1>
          {currentRun && (
            <p className="text-xs font-medium text-court-500 mt-1">{currentRun.name}</p>
          )}
          {isRunMember && (
            <p className="text-xs text-gray-400 mt-1">{statusMessage[user?.player_status] || ""}</p>
          )}
          {!isRunMember && user?.role === "super_admin" && (
            <p className="text-xs text-gray-400 mt-1">Managing as Super Admin</p>
          )}
          {user?.avatar_url && getPlayerById(user.avatar_url) && (
            <p className="text-[10px] text-gray-500 mt-0.5">
              Repping {getPlayerById(user.avatar_url).name} — {getPlayerById(user.avatar_url).team}
            </p>
          )}
        </div>
      </div>

      {/* Stats Cards — retro style */}
      {isRunMember && (
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl bg-gradient-to-b from-court-400 to-court-600 p-[2px]">
          <div className="rounded-[10px] bg-gray-950 p-4 text-center">
            <div className="font-retro text-2xl text-court-400">
              {((user?.win_rate || 0.5) * 100).toFixed(0)}%
            </div>
            <div className="text-[8px] text-gray-500 uppercase tracking-wider mt-1">Win Rate</div>
            <div className="text-xs text-gray-400 mt-0.5">
              {user?.games_won || 0}W - {(user?.games_played || 0) - (user?.games_won || 0)}L
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-gradient-to-b from-arcade-400 to-arcade-600 p-[2px]">
          <div className="rounded-[10px] bg-gray-950 p-4 text-center">
            {myForm?.current_streak?.count > 0 ? (
              <>
                <div className={`font-retro text-2xl ${
                  myForm.current_streak.type === "win" ? "text-green-400" : "text-red-400"
                }`}>
                  {myForm.current_streak.count}{myForm.current_streak.type === "win" ? "W" : "L"}
                </div>
                <div className="text-[8px] text-gray-500 uppercase tracking-wider mt-1">Streak</div>
              </>
            ) : (
              <>
                <div className="font-retro text-2xl text-gray-600">—</div>
                <div className="text-[8px] text-gray-500 uppercase tracking-wider mt-1">Streak</div>
              </>
            )}
            {myForm?.last_5 && (
              <div className="text-xs text-gray-400 mt-0.5">
                Last 5: {myForm.last_5.wins}W-{myForm.last_5.losses}L
              </div>
            )}
          </div>
        </div>
      </div>)}

      {/* Next Game — gold frame */}
      <div className="mb-6">
        <h2 className="text-xs font-bold text-court-500 uppercase tracking-wider mb-2">Next Game</h2>
        <div className="rounded-xl bg-gradient-to-b from-amber-300 via-yellow-400 to-amber-500 p-[2px]">
          <div className="rounded-[10px] bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 overflow-hidden">
            {/* Header strip */}
            <div className="bg-gradient-to-r from-arcade-700 via-arcade-600 to-court-600 px-4 py-1.5 flex items-center justify-between">
              <span className="font-retro text-[7px] text-white/60 tracking-widest">NEXT UP</span>
              {nextGame && (
                <span className="text-[10px] text-white/50">
                  {nextGame.accepted_count}/{nextGame.roster_size} players
                </span>
              )}
            </div>

            <div className="p-4">
              {loading ? (
                <p className="text-gray-500 text-sm">Loading...</p>
              ) : nextGame ? (
                <div>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <h3 className="font-retro text-[10px] text-white">{nextGame.title.toUpperCase()}</h3>
                      <p className="text-sm text-gray-400 mt-1">
                        {new Date(nextGame.game_date).toLocaleDateString("en-US", {
                          weekday: "long", month: "long", day: "numeric",
                          hour: "numeric", minute: "2-digit",
                        })}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{nextGame.location}</p>
                    </div>
                    <Link to={`/games/${nextGame.id}`} className="text-xs text-court-400 hover:text-court-300 font-medium">
                      Details →
                    </Link>
                  </div>

                  {/* RSVP Action */}
                  {nextGame.status !== "teams_set" && isRunMember && (
                    <div className="mt-3 pt-3 border-t border-gray-700/50">
                      {myRsvp ? (
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-500">RSVP:</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            myRsvp.status === "accepted" ? "bg-green-500/20 text-green-400" :
                            myRsvp.status === "declined" ? "bg-red-500/20 text-red-400" :
                            "bg-gray-700 text-gray-400"
                          }`}>{myRsvp.status.toUpperCase()}</span>
                          {myRsvp.status !== "accepted" && (
                            <button onClick={() => handleRsvp("accepted")} className="btn-primary text-xs py-1 px-3">
                              I'm In!
                            </button>
                          )}
                          {myRsvp.status !== "declined" && (
                            <button onClick={() => handleRsvp("declined")} className="btn-secondary text-xs py-1 px-3">
                              Can't Make It
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-500">Are you playing?</span>
                          <button onClick={() => handleRsvp("accepted")} className="btn-primary text-xs py-1 px-3">
                            I'm In!
                          </button>
                          <button onClick={() => handleRsvp("declined")} className="btn-secondary text-xs py-1 px-3">
                            Can't Make It
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No upcoming games scheduled.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Last Completed Game — purple frame */}
      {lastCompleted && (
        <div className="mb-6">
          <h2 className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-2">Last Game</h2>
          <div className="rounded-xl bg-gradient-to-b from-purple-400 via-purple-500 to-purple-600 p-[2px]">
            <div className="rounded-[10px] bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 overflow-hidden">
              {/* Header strip */}
              <div className="bg-gradient-to-r from-purple-800 via-purple-700 to-purple-600 px-4 py-1.5 flex items-center justify-between">
                <span className="font-retro text-[7px] text-white/60 tracking-widest">FINAL</span>
                <Link to={`/games/${lastCompleted.id}`} className="text-[10px] text-white/50 hover:text-white/80">
                  Details →
                </Link>
              </div>

              <div className="p-4">
                <h3 className="font-retro text-[10px] text-white">{lastCompleted.title.toUpperCase()}</h3>

                {/* Score */}
                {lastCompleted.result?.team_scores?.length > 0 && (
                  <div className="flex items-center gap-4 mt-3 justify-center">
                    {[...lastCompleted.result.team_scores]
                      .sort((a, b) => b.wins - a.wins)
                      .map((ts, idx) => (
                        <div key={ts.team} className="flex items-center gap-2">
                          {idx > 0 && <span className="font-retro text-[10px] text-gray-600">VS</span>}
                          <div className="text-center">
                            <div className="font-retro text-lg text-court-400">{ts.wins}</div>
                            <div className="text-[9px] text-gray-500">{ts.team_name}</div>
                          </div>
                        </div>
                      ))}
                  </div>
                )}

                {/* Commentary */}
                {lastCompleted.commentary && (
                  <p className="text-xs text-gray-500 italic mt-3">{lastCompleted.commentary}</p>
                )}

                {/* Voting or Awards */}
                {lastAwards && (
                  <div className="mt-3 pt-3 border-t border-gray-700/50">
                    {lastAwards.voting_open && isParticipant ? (
                      <>
                        <p className="text-[10px] font-bold text-gray-400 mb-2">
                          VOTE ({lastAwards.votes_cast}/{lastAwards.total_voters})
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <VoteDropdown label="MVP" emoji="🏆" voteType="mvp"
                            players={eligibleForVote} currentVoteId={myVotes?.mvp_vote?.nominee_id} onVote={handleVote} />
                          <VoteDropdown label="X Factor" emoji="⚡" voteType="xfactor"
                            players={eligibleForVote} currentVoteId={myVotes?.xfactor_vote?.nominee_id} onVote={handleVote} />
                          <VoteDropdown label="Shaqtin'" emoji="🤦" voteType="shaqtin"
                            players={eligibleForVote} currentVoteId={myVotes?.shaqtin_vote?.nominee_id} onVote={handleVote} />
                        </div>
                      </>
                    ) : !lastAwards.voting_open ? (
                      <div className="grid grid-cols-3 gap-2">
                        <AwardCard label="MVP" emoji="🏆" winner={lastAwards.mvp} />
                        <AwardCard label="X Factor" emoji="⚡" winner={lastAwards.xfactor} />
                        <AwardCard label="Shaqtin'" emoji="🤦" winner={lastAwards.shaqtin} />
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500">
                        Voting open — {lastAwards.votes_cast}/{lastAwards.total_voters} voted
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Links — retro cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-8">
        {[
          { to: "/games", icon: "🏀", label: "Games" },
          { to: "/players", icon: "👥", label: "Roster" },
          { to: "/stats", icon: "📊", label: "Stats" },
          { to: "/notifications", icon: "🔔", label: "Alerts" },
          ...(isRunMember ? [{ to: `/players/${user?.id}`, icon: "⭐", label: "Profile" }] : []),
          ...((user?.role === "super_admin" || user?.role === "admin") ? [{ to: "/admin", icon: "⚙️", label: "Admin" }] : []),
        ].map((link) => (
          <Link key={link.to} to={link.to} className="block rounded-xl bg-gradient-to-b from-gray-600 to-gray-700 p-[1.5px] hover:from-court-400 hover:to-court-600 transition-all">
            <div className="rounded-[10px] bg-gray-950 py-4 text-center hover:bg-gray-900 transition-colors">
              <span className="text-2xl">{link.icon}</span>
              <p className="font-retro text-[7px] text-gray-400 mt-2">{link.label.toUpperCase()}</p>
            </div>
          </Link>
        ))}
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
      <label className="block text-xs font-bold text-gray-400 mb-1">
        {emoji} {label}
      </label>
      <select
        value={currentVoteId || ""}
        onChange={(e) => onVote(voteType, e.target.value)}
        className="w-full text-sm border border-gray-600 rounded-lg px-3 py-2 bg-gray-800 text-gray-100 focus:border-court-500 focus:outline-none"
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
function AwardCard({ label, emoji, winner }) {
  return (
    <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-2 text-center">
      <div className="text-lg">{emoji}</div>
      <div className="font-retro text-[6px] text-gray-500 uppercase tracking-wider mt-0.5">{label}</div>
      {winner ? (
        <>
          <div className="flex justify-center mt-1">
            {winner.player.avatar_url ? (
              <AvatarBadge avatarId={winner.player.avatar_url} size="sm" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-400">
                {winner.player.full_name.charAt(0)}
              </div>
            )}
          </div>
          <div className="text-[10px] font-bold text-white truncate mt-1">{winner.player.full_name}</div>
          <div className="text-[8px] text-gray-500">{winner.vote_count}v</div>
        </>
      ) : (
        <div className="text-[9px] text-gray-600 italic mt-1">—</div>
      )}
    </div>
  );
}
