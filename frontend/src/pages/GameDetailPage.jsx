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
 *   - Team roster (when teams are set)
 *   - Admin actions (generate teams, record results)
 *   - Post-game voting (MVP and Shaqtin' a Fool)
 *   - Award results (after voting closes)
 */

import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import toast from "react-hot-toast";
import useAuthStore from "../stores/authStore";
import { getGame, rsvpToGame, generateTeams, recordResult } from "../api/games";
import { castVote, getMyVotes, getGameAwards } from "../api/votes";
import NbaJamTeams from "../components/NbaJamTeams";

export default function GameDetailPage() {
  const { id } = useParams();
  const user = useAuthStore((s) => s.user);
  const [game, setGame] = useState(null);
  const [awards, setAwards] = useState(null);
  const [myVotes, setMyVotes] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchGame = async () => {
    try {
      const { data } = await getGame(id);
      setGame(data);

      // Fetch awards and votes if game is completed
      if (data.status === "completed") {
        try {
          const [awardsRes, votesRes] = await Promise.all([
            getGameAwards(id),
            getMyVotes(id),
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

  const handleVote = async (voteType, nomineeId) => {
    try {
      await castVote(id, { vote_type: voteType, nominee_id: nomineeId });
      toast.success(`${voteType === "mvp" ? "MVP" : "Shaqtin'"} vote recorded!`);
      // Refresh votes and awards
      const [awardsRes, votesRes] = await Promise.all([
        getGameAwards(id),
        getMyVotes(id),
      ]);
      setAwards(awardsRes.data);
      setMyVotes(votesRes.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Vote failed");
    }
  };

  if (loading) return <div className="max-w-4xl mx-auto px-4 py-8">Loading...</div>;
  if (!game) return <div className="max-w-4xl mx-auto px-4 py-8">Game not found</div>;

  const myRsvp = game.rsvps?.find((r) => r.user_id === user?.id);
  const teamA = game.teams?.filter((t) => t.team === "team_a") || [];
  const teamB = game.teams?.filter((t) => t.team === "team_b") || [];
  const allParticipants = game.teams?.map((t) => t.user).filter(Boolean) || [];
  const isParticipant = game.teams?.some((t) => t.user_id === user?.id);

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

      {/* Award Results (shown after voting closes) */}
      {awards && !awards.voting_open && (awards.mvp || awards.shaqtin) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {awards.mvp && (
            <div className="card border-2 border-yellow-400 bg-yellow-50">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-3xl">🏆</span>
                <div>
                  <p className="text-xs font-semibold text-yellow-600 uppercase tracking-wide">MVP</p>
                  <Link to={`/players/${awards.mvp.player.id}`} className="text-lg font-bold text-gray-900 hover:text-court-600">
                    {awards.mvp.player.full_name}
                  </Link>
                </div>
              </div>
              <p className="text-sm text-yellow-700">{awards.mvp.vote_count} vote{awards.mvp.vote_count !== 1 ? "s" : ""}</p>
            </div>
          )}
          {awards.shaqtin && (
            <div className="card border-2 border-purple-400 bg-purple-50">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-3xl">🤦</span>
                <div>
                  <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide">Shaqtin' a Fool</p>
                  <Link to={`/players/${awards.shaqtin.player.id}`} className="text-lg font-bold text-gray-900 hover:text-court-600">
                    {awards.shaqtin.player.full_name}
                  </Link>
                </div>
              </div>
              <p className="text-sm text-purple-700">{awards.shaqtin.vote_count} vote{awards.shaqtin.vote_count !== 1 ? "s" : ""}</p>
            </div>
          )}
        </div>
      )}

      {/* Voting Section (shown for participants when voting is open) */}
      {game.status === "completed" && awards?.voting_open && isParticipant && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Cast Your Votes</h2>
            <span className="text-sm text-gray-500">
              Closes {new Date(awards.voting_deadline).toLocaleString("en-US", {
                month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
              })}
            </span>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            {awards.votes_cast} of {awards.total_voters} participants have voted.
            Results are hidden until voting closes.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* MVP Vote */}
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

            {/* Shaqtin' Vote */}
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

      {/* Voting closed message for participants who can no longer vote */}
      {game.status === "completed" && awards && !awards.voting_open && isParticipant && (
        <div className="text-center text-sm text-gray-500 mb-6">
          Voting has closed. {awards.votes_cast} of {awards.total_voters} participants voted.
        </div>
      )}

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

      {/* Teams Display — NBA Jam Style */}
      {game.teams?.length > 0 && (
        <div className="mb-6">
          <NbaJamTeams teamA={teamA} teamB={teamB} />
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

/**
 * VotingCard Component
 * ====================
 * TEACHING NOTE:
 *   A self-contained voting UI for one award category. Displays all
 *   eligible participants (excluding the current user, since you can't
 *   vote for yourself) with radio-button style selection.
 *   The current vote is highlighted so users know what they've picked.
 */
function VotingCard({ title, emoji, description, color, participants, currentUserId, currentVoteId, onVote }) {
  const borderColor = color === "yellow" ? "border-yellow-300" : "border-purple-300";
  const headerColor = color === "yellow" ? "text-yellow-700" : "text-purple-700";
  const selectedBg = color === "yellow" ? "bg-yellow-100 border-yellow-400" : "bg-purple-100 border-purple-400";

  // Filter out the current user (can't vote for yourself)
  const eligible = participants.filter((p) => p.id !== currentUserId);

  return (
    <div className={`border-2 ${borderColor} rounded-xl p-4`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xl">{emoji}</span>
        <h3 className={`font-bold ${headerColor}`}>{title}</h3>
      </div>
      <p className="text-xs text-gray-500 mb-3">{description}</p>

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
                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
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

