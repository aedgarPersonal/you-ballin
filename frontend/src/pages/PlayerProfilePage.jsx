/**
 * Player Profile Page
 * ===================
 * Displays a player's stats, ratings, and the anonymous rating form.
 *
 * TEACHING NOTE:
 *   This page combines public profile data with the anonymous rating
 *   system. The rating form checks:
 *   - Can't rate yourself
 *   - Shows existing rating if already rated
 *   - Enforces the 30-day cooldown between updates
 */

import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import toast from "react-hot-toast";
import useAuthStore from "../stores/authStore";
import useRunStore from "../stores/runStore";
import { getPlayer, updateMyProfile } from "../api/players";
import { updatePlayerAdmin } from "../api/admin";
import { getPlayerRatingSummary, getMyRatingForPlayer, ratePlayer } from "../api/ratings";
import { getPlayerMatchups } from "../api/stats";
import AvatarPicker, { AvatarBadge } from "../components/AvatarPicker";
import { getPlayerById } from "../data/legacyPlayers";

export default function PlayerProfilePage() {
  const { id } = useParams();
  const currentUser = useAuthStore((s) => s.user);
  const { currentRun } = useRunStore();
  const runId = currentRun?.id;
  const [player, setPlayer] = useState(null);
  const [summary, setSummary] = useState(null);
  const [myRating, setMyRating] = useState(null);
  const [ratingForm, setRatingForm] = useState({ offense: 3, defense: 3, overall: 3 });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [matchups, setMatchups] = useState(null);
  const updateUser = useAuthStore((s) => s.updateUser);

  const isOwnProfile = currentUser?.id === parseInt(id);
  const { isRunAdmin } = useRunStore();
  const isAdmin = currentUser?.role === "super_admin" || currentUser?.role === "admin" || isRunAdmin;
  const canEditPhysical = isAdmin || isOwnProfile;

  const fetchPlayer = async () => {
    try {
      const fetches = [
        getPlayer(id),
        getPlayerRatingSummary(runId, id),
      ];
      if (runId) {
        fetches.push(getPlayerMatchups(runId, id));
      }

      const results = await Promise.allSettled(fetches);
      if (results[0].status === "fulfilled") setPlayer(results[0].value.data);
      if (results[1].status === "fulfilled") setSummary(results[1].value.data);
      if (results[2]?.status === "fulfilled") setMatchups(results[2].value.data);

      if (!isOwnProfile) {
        const myRatingRes = await getMyRatingForPlayer(runId, id);
        setMyRating(myRatingRes.data);
        if (myRatingRes.data.rating) {
          setRatingForm({
            offense: myRatingRes.data.rating.offense,
            defense: myRatingRes.data.rating.defense,
            overall: myRatingRes.data.rating.overall,
          });
        }
      }
    } catch {
      toast.error("Failed to load player profile");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPlayer(); }, [id, isOwnProfile]);

  const handleRate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await ratePlayer(runId, id, ratingForm);
      toast.success("Rating submitted!");
      // Refresh data
      const [summaryRes, myRatingRes] = await Promise.all([
        getPlayerRatingSummary(runId, id),
        getMyRatingForPlayer(runId, id),
      ]);
      setSummary(summaryRes.data);
      setMyRating(myRatingRes.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Rating failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAvatarChange = async (avatarId) => {
    try {
      await updateMyProfile({ avatar_url: avatarId });
      setPlayer({ ...player, avatar_url: avatarId });
      updateUser({ avatar_url: avatarId });
      toast.success("Avatar updated!");
    } catch {
      toast.error("Failed to update avatar");
    }
  };

  if (loading) return <div className="max-w-4xl mx-auto px-4 py-8">Loading...</div>;
  if (!player) return <div className="max-w-4xl mx-auto px-4 py-8">Player not found</div>;

  const legacy = getPlayerById(player.avatar_url);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Profile Header */}
      <div className="card mb-6">
        <div className="flex items-center gap-6">
          {/* Avatar */}
          {legacy ? (
            <div className="flex flex-col items-center">
              <button
                onClick={isOwnProfile ? () => setShowAvatarPicker(true) : undefined}
                className={isOwnProfile ? "cursor-pointer hover:opacity-80 transition-opacity" : ""}
              >
                <AvatarBadge avatarId={player.avatar_url} size="lg" />
              </button>
              <span className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">{legacy.name}</span>
              {isOwnProfile && (
                <button
                  onClick={() => setShowAvatarPicker(true)}
                  className="text-[10px] text-court-600 hover:text-court-700"
                >
                  Change
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={isOwnProfile ? () => setShowAvatarPicker(true) : undefined}
              className={`w-20 h-20 rounded-full bg-court-100 flex items-center justify-center text-court-600 font-bold text-3xl ${
                isOwnProfile ? "cursor-pointer hover:opacity-80 transition-opacity" : ""
              }`}
            >
              {player.full_name.charAt(0)}
            </button>
          )}

          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{player.full_name}</h1>
            <p className="text-gray-500 dark:text-gray-400">@{player.username}</p>
            <div className="flex items-center gap-2 mt-2">
              {isAdmin ? (
                <select
                  value={player.player_status}
                  onChange={async (e) => {
                    const newStatus = e.target.value;
                    const labels = { regular: "Regular", dropin: "Drop-in", inactive: "Inactive" };
                    const oldStatus = player.player_status;
                    setPlayer((prev) => ({ ...prev, player_status: newStatus }));
                    try {
                      await updatePlayerAdmin(runId, player.id, { player_status: newStatus });
                      toast.success(`Status changed to ${labels[newStatus]}`);
                    } catch {
                      setPlayer((prev) => ({ ...prev, player_status: oldStatus }));
                      toast.error("Update failed");
                    }
                  }}
                  className="text-xs font-semibold border rounded px-2 py-1 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600"
                >
                  <option value="regular">Regular</option>
                  <option value="dropin">Drop-in</option>
                  <option value="inactive">Inactive</option>
                </select>
              ) : (
                <span className={`badge-${player.player_status}`}>{player.player_status}</span>
              )}
              {isOwnProfile && <span className="badge bg-court-100 text-court-800">You</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Avatar Picker Modal */}
      {showAvatarPicker && (
        <AvatarPicker
          value={player.avatar_url}
          onChange={(id) => {
            handleAvatarChange(id);
          }}
          onClose={() => setShowAvatarPicker(false)}
        />
      )}

      {/* Stats Grid */}
      <div className={`grid gap-4 mb-6 ${isAdmin ? "grid-cols-2 md:grid-cols-4" : "grid-cols-1 md:grid-cols-2"}`}>
        {isAdmin && <StatCard label="Offense" value={summary?.avg_offense?.toFixed(1)} max="5.0" />}
        {isAdmin && <StatCard label="Defense" value={summary?.avg_defense?.toFixed(1)} max="5.0" />}
        {isAdmin && <StatCard label="Overall" value={summary?.avg_overall?.toFixed(1)} max="5.0" highlight />}
        <StatCard label="Win Rate" value={`${((summary?.jordan_factor || 0.5) * 100).toFixed(0)}%`} subtitle={`${summary?.games_won || 0}W - ${(summary?.games_played || 0) - (summary?.games_won || 0)}L`} />
        <StatCard label="Games" value={summary?.games_played || 0} subtitle={`${summary?.games_won || 0} wins`} />
      </div>

      {/* Physical Stats */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold mb-3">Physical Stats</h2>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Height</p>
            {canEditPhysical ? (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="3"
                  max="7"
                  defaultValue={player.height_inches ? Math.floor(player.height_inches / 12) : ""}
                  placeholder="ft"
                  onBlur={(e) => {
                    const ft = parseInt(e.target.value) || 0;
                    const inchesEl = e.target.parentElement.querySelector('[data-field="inches"]');
                    const inch = parseInt(inchesEl?.value) || 0;
                    const totalInches = ft * 12 + inch;
                    if (totalInches > 0 && totalInches !== player.height_inches) {
                      const save = isOwnProfile
                        ? updateMyProfile({ height_inches: totalInches }).then(() => updateUser({ height_inches: totalInches }))
                        : updatePlayerAdmin(runId, player.id, { height_inches: totalInches });
                      save
                        .then(() => { setPlayer({ ...player, height_inches: totalInches }); toast.success("Height updated"); })
                        .catch(() => toast.error("Failed to update"));
                    }
                  }}
                  className="w-12 text-lg font-semibold border border-transparent hover:border-gray-300 dark:hover:border-gray-600 rounded px-1 py-0.5 bg-transparent dark:text-gray-100 focus:border-court-500 focus:outline-none text-center"
                />
                <span className="text-gray-500 dark:text-gray-400 font-medium">ft</span>
                <input
                  type="number"
                  min="0"
                  max="11"
                  data-field="inches"
                  defaultValue={player.height_inches ? player.height_inches % 12 : ""}
                  placeholder="in"
                  onBlur={(e) => {
                    const inch = parseInt(e.target.value) || 0;
                    const ftEl = e.target.parentElement.querySelector('input:first-child');
                    const ft = parseInt(ftEl?.value) || 0;
                    const totalInches = ft * 12 + inch;
                    if (totalInches > 0 && totalInches !== player.height_inches) {
                      const save = isOwnProfile
                        ? updateMyProfile({ height_inches: totalInches }).then(() => updateUser({ height_inches: totalInches }))
                        : updatePlayerAdmin(runId, player.id, { height_inches: totalInches });
                      save
                        .then(() => { setPlayer({ ...player, height_inches: totalInches }); toast.success("Height updated"); })
                        .catch(() => toast.error("Failed to update"));
                    }
                  }}
                  className="w-12 text-lg font-semibold border border-transparent hover:border-gray-300 dark:hover:border-gray-600 rounded px-1 py-0.5 bg-transparent dark:text-gray-100 focus:border-court-500 focus:outline-none text-center"
                />
                <span className="text-gray-500 dark:text-gray-400 font-medium">in</span>
              </div>
            ) : (
              <p className="text-lg font-semibold">
                {player.height_inches ? `${Math.floor(player.height_inches / 12)}'${player.height_inches % 12}"` : "N/A"}
              </p>
            )}
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Age</p>
            {canEditPhysical ? (
              <input
                type="number"
                defaultValue={player.age || ""}
                placeholder="age"
                onBlur={(e) => {
                  const val = parseInt(e.target.value);
                  if (val && val !== player.age) {
                    const save = isOwnProfile
                      ? updateMyProfile({ age: val }).then(() => updateUser({ age: val }))
                      : updatePlayerAdmin(runId, player.id, { age: val });
                    save
                      .then(() => { setPlayer({ ...player, age: val }); toast.success("Age updated"); })
                      .catch(() => toast.error("Failed to update"));
                  }
                }}
                className="w-full text-lg font-semibold border border-transparent hover:border-gray-300 dark:hover:border-gray-600 rounded px-1 py-0.5 bg-transparent dark:text-gray-100 focus:border-court-500 focus:outline-none"
              />
            ) : (
              <p className="text-lg font-semibold">{player.age || "N/A"}</p>
            )}
          </div>
          {isAdmin && (
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Mobility</p>
            <input
              type="number"
              step="0.5"
              min="1"
              max="5"
              defaultValue={player.mobility || ""}
              placeholder="1-5"
              onBlur={(e) => {
                const val = parseFloat(e.target.value);
                if (val && val !== player.mobility) {
                  updatePlayerAdmin(runId, player.id, { mobility: val })
                    .then(() => { setPlayer({ ...player, mobility: val }); toast.success("Mobility updated"); })
                    .catch(() => toast.error("Failed to update"));
                }
              }}
              className="w-full text-lg font-semibold border border-transparent hover:border-gray-300 dark:hover:border-gray-600 rounded px-1 py-0.5 bg-transparent dark:text-gray-100 focus:border-court-500 focus:outline-none"
            />
          </div>
          )}
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
          {canEditPhysical ? "Click a value to edit. Changes save on blur." : "Physical stats are maintained by admins."}
        </p>
      </div>

      {/* Player Stats & Matchups */}
      {matchups && (matchups.best_teammates?.length > 0 || matchups.toughest_opponents?.length > 0) && (
        <div className="card mb-6">
          <h2 className="text-lg font-semibold mb-2 text-court-600 uppercase tracking-wide text-sm">
            {isOwnProfile ? "Your Stats" : `${player.full_name}'s Stats`}
          </h2>

          {/* Summary row */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
            <div className="text-center">
              <div className="text-2xl font-black text-court-600">{((player.jordan_factor || 0.5) * 100).toFixed(0)}%</div>
              <div className="text-xs text-gray-400">Win Rate</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-black text-gray-200">{player.games_won || 0}-{(player.games_played || 0) - (player.games_won || 0)}</div>
              <div className="text-xs text-gray-400">W-L Record</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-black text-yellow-500">{player.mvp_count || 0}</div>
              <div className="text-xs text-gray-400">MVPs</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-black text-blue-500">{player.xfactor_count || 0}</div>
              <div className="text-xs text-gray-400">X Factors</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-black text-purple-500">{player.shaqtin_count || 0}</div>
              <div className="text-xs text-gray-400">Shaqtin'</div>
            </div>
          </div>

          {/* Best Teammates & Toughest Opponents */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {matchups.best_teammates?.length > 0 && (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                <h3 className="text-xs font-bold text-green-500 uppercase tracking-wider mb-2">Best Teammates</h3>
                <div className="space-y-2">
                  {matchups.best_teammates.map((m) => (
                    <div key={m.player_id} className="flex items-center gap-2">
                      {m.avatar_url && <AvatarBadge avatarId={m.avatar_url} size="xs" />}
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-200 flex-1">{m.full_name}</span>
                      <span className="text-sm font-bold text-green-500">{(m.win_rate * 100).toFixed(0)}%</span>
                      <span className="text-xs text-gray-400">{m.wins}W-{m.games - m.wins}L</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {matchups.toughest_opponents?.length > 0 && (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                <h3 className="text-xs font-bold text-red-500 uppercase tracking-wider mb-2">Toughest Opponents</h3>
                <div className="space-y-2">
                  {matchups.toughest_opponents.map((m) => (
                    <div key={m.player_id} className="flex items-center gap-2">
                      {m.avatar_url && <AvatarBadge avatarId={m.avatar_url} size="xs" />}
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-200 flex-1">{m.full_name}</span>
                      <span className="text-sm font-bold text-red-500">{(m.win_rate * 100).toFixed(0)}%</span>
                      <span className="text-xs text-gray-400">{m.wins}W-{m.games - m.wins}L</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Rating Form */}
      {!isOwnProfile && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-1">Rate This Player</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Ratings are anonymous. {summary?.total_ratings} total ratings.
            {myRating?.has_rated && !myRating?.can_update && (
              <span className="text-yellow-600 ml-2">
                Next update available: {new Date(myRating.next_update_available).toLocaleDateString()}
              </span>
            )}
          </p>

          {(!myRating?.has_rated || myRating?.can_update) ? (
            <form onSubmit={handleRate} className="space-y-4">
              <RatingSlider
                label="Offense"
                value={ratingForm.offense}
                onChange={(v) => setRatingForm({ ...ratingForm, offense: v })}
              />
              <RatingSlider
                label="Defense"
                value={ratingForm.defense}
                onChange={(v) => setRatingForm({ ...ratingForm, defense: v })}
              />
              <RatingSlider
                label="Overall"
                value={ratingForm.overall}
                onChange={(v) => setRatingForm({ ...ratingForm, overall: v })}
              />
              <button type="submit" disabled={submitting} className="btn-primary">
                {submitting ? "Submitting..." : myRating?.has_rated ? "Update Rating" : "Submit Rating"}
              </button>
            </form>
          ) : (
            <p className="text-gray-500 dark:text-gray-400">
              You've already rated this player. You can update your rating once per month.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, max, highlight, subtitle }) {
  return (
    <div className={`card text-center ${highlight ? "border-2 border-court-300" : ""}`}>
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`text-2xl font-bold ${highlight ? "text-court-600" : "text-gray-900 dark:text-gray-100"}`}>
        {value}
      </p>
      {max && <p className="text-xs text-gray-400 dark:text-gray-500">/ {max}</p>}
      {subtitle && <p className="text-xs text-gray-400 dark:text-gray-500">{subtitle}</p>}
    </div>
  );
}

function RatingSlider({ label, value, onChange }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
        <span className="text-sm font-bold text-court-600">{value.toFixed(1)}</span>
      </div>
      <input
        type="range"
        min="1"
        max="5"
        step="0.5"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-court-500"
      />
      <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500">
        <span>1</span>
        <span>2</span>
        <span>3</span>
        <span>4</span>
        <span>5</span>
      </div>
    </div>
  );
}
