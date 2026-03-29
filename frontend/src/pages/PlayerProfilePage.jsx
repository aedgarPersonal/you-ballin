/**
 * Player Profile Page
 * ===================
 * Displays a player's stats and dynamic metrics from the run's CustomMetric definitions.
 * Admins can view and edit metric values on the Ratings tab.
 */

import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import toast from "react-hot-toast";
import useAuthStore from "../stores/authStore";
import useRunStore from "../stores/runStore";
import { getPlayer, updateMyProfile } from "../api/players";
import { updatePlayerAdmin } from "../api/admin";
import { listCustomMetrics, getPlayerMetrics, updatePlayerMetrics } from "../api/algorithm";
import { getPlayerMatchups, getPlayerGameHistory, getPlayerForm } from "../api/stats";
import AvatarPicker, { AvatarBadge } from "../components/AvatarPicker";
import { getPlayerById } from "../data/legacyPlayers";

export default function PlayerProfilePage() {
  const { id } = useParams();
  const currentUser = useAuthStore((s) => s.user);
  const { currentRun } = useRunStore();
  const runId = currentRun?.id;
  const [player, setPlayer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [matchups, setMatchups] = useState(null);
  const [gameHistory, setGameHistory] = useState(null);
  const [form, setForm] = useState(null);
  const [showAllTeammates, setShowAllTeammates] = useState(false);
  const [showAllOpponents, setShowAllOpponents] = useState(false);
  const updateUser = useAuthStore((s) => s.updateUser);
  const [activeTab, setActiveTab] = useState("overview");

  // Dynamic metrics state
  const [customMetrics, setCustomMetrics] = useState([]);
  const [playerMetrics, setPlayerMetrics] = useState([]);

  const isOwnProfile = currentUser?.id === parseInt(id);
  const { isRunAdmin } = useRunStore();
  const isAdmin = currentUser?.role === "super_admin" || currentUser?.role === "admin" || isRunAdmin;
  const canEditPhysical = isAdmin || isOwnProfile;

  const TABS = [
    { id: "overview", label: "Overview" },
    { id: "history", label: "History" },
    { id: "matchups", label: "Matchups" },
    ...(isAdmin ? [{ id: "ratings", label: "Ratings" }] : []),
  ];

  const fetchPlayer = async () => {
    try {
      const fetches = [getPlayer(id)];
      if (runId) {
        fetches.push(getPlayerMatchups(runId, id));
        fetches.push(getPlayerGameHistory(runId, id));
        fetches.push(getPlayerForm(runId, id));
      }

      const results = await Promise.allSettled(fetches);
      if (results[0].status === "fulfilled") setPlayer(results[0].value.data);
      if (results[1]?.status === "fulfilled") setMatchups(results[1].value.data);
      if (results[2]?.status === "fulfilled") setGameHistory(results[2].value.data);
      if (results[3]?.status === "fulfilled") setForm(results[3].value.data);

      // Load dynamic metrics for admin ratings tab
      if (runId) {
        try {
          const [metricsRes, playerMetricsRes] = await Promise.all([
            listCustomMetrics(runId),
            getPlayerMetrics(runId, id),
          ]);
          setCustomMetrics(metricsRes.data.metrics || metricsRes.data || []);
          setPlayerMetrics(playerMetricsRes.data.metrics || []);
        } catch {
          // Metrics not available
        }
      }
    } catch {
      toast.error("Failed to load player profile");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPlayer(); }, [id, isOwnProfile]);

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

  // Build a lookup of metric values by metric_id
  const metricValueMap = {};
  for (const pm of playerMetrics) {
    metricValueMap[pm.metric_id] = pm.value;
  }

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

          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{player.full_name}</h1>
            <p className="text-gray-500 dark:text-gray-400">@{player.username}</p>

            {/* Editable email & phone for own profile */}
            {isOwnProfile && (
              <div className="flex flex-col sm:flex-row gap-2 mt-2">
                <input
                  type="email"
                  defaultValue={player.email}
                  placeholder="Email"
                  onBlur={(e) => {
                    const val = e.target.value.trim();
                    if (val && val !== player.email) {
                      updateMyProfile({ email: val })
                        .then(() => { setPlayer({ ...player, email: val }); updateUser({ email: val }); toast.success("Email updated"); })
                        .catch((err) => { e.target.value = player.email; toast.error(err.response?.data?.detail || "Failed to update email"); });
                    }
                  }}
                  className="text-sm border border-transparent hover:border-gray-300 dark:hover:border-gray-600 rounded px-2 py-1 bg-transparent dark:text-gray-300 focus:border-court-500 focus:outline-none"
                />
                <input
                  type="tel"
                  defaultValue={player.phone || ""}
                  placeholder="Phone (optional)"
                  onBlur={(e) => {
                    const val = e.target.value.trim() || null;
                    if (val !== (player.phone || null)) {
                      updateMyProfile({ phone: val })
                        .then(() => { setPlayer({ ...player, phone: val }); updateUser({ phone: val }); toast.success("Phone updated"); })
                        .catch(() => toast.error("Failed to update phone"));
                    }
                  }}
                  className="text-sm border border-transparent hover:border-gray-300 dark:hover:border-gray-600 rounded px-2 py-1 bg-transparent dark:text-gray-300 focus:border-court-500 focus:outline-none"
                />
              </div>
            )}
            {!isOwnProfile && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{player.email}</p>
            )}

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

      {/* Stats Summary Row (always visible above tabs) */}
      <div className="grid gap-3 mb-6 grid-cols-3 md:grid-cols-6">
        <StatCard label="Rating" value={player?.player_rating || 50} highlight />
        <StatCard label="Win Rate" value={`${((player?.win_rate || 0.5) * 100).toFixed(0)}%`} subtitle={`${player?.games_won || 0}W-${(player?.games_played || 0) - (player?.games_won || 0)}L`} />
        <StatCard label="Games" value={player?.games_played || 0} subtitle={`${player?.games_won || 0} wins`} />
        {(player?.mvp_count > 0 || player?.xfactor_count > 0 || player?.shaqtin_count > 0) && (
          <>
            {player.mvp_count > 0 && <StatCard label="MVP" value={`${player.mvp_count}`} />}
            {player.xfactor_count > 0 && <StatCard label="X Factor" value={`${player.xfactor_count}`} />}
            {player.shaqtin_count > 0 && <StatCard label="Shaqtin'" value={`${player.shaqtin_count}`} />}
          </>
        )}
      </div>

      {/* Tab Bar */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t.id
                ? "border-court-500 text-court-600"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Overview */}
      {activeTab === "overview" && (
        <>
          {/* Current Form */}
          {form && form.current_streak && (
            <div className="card mb-6">
              <h2 className="text-sm font-semibold text-court-600 uppercase tracking-wide mb-3">Current Form</h2>
              <div className="flex flex-wrap items-center gap-4">
                {/* Streak badge */}
                {form.current_streak.count > 0 && (
                  <div className={`px-3 py-1 rounded-full text-sm font-bold ${
                    form.current_streak.type === "win"
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                  }`}>
                    {form.current_streak.type === "win" ? "\uD83D\uDD25" : "\u2744\uFE0F"} {form.current_streak.count}{form.current_streak.type === "win" ? "W" : "L"}
                  </div>
                )}

                {/* Last 5 */}
                {form.last_5 && (
                  <div className="text-center">
                    <div className="text-sm font-bold text-gray-800 dark:text-gray-200">
                      {form.last_5.wins}W-{form.last_5.losses}L
                      <span className="text-xs text-gray-400 ml-1">({Math.round(form.last_5.win_rate * 100)}%)</span>
                    </div>
                    <div className="text-xs text-gray-400">Last 5</div>
                  </div>
                )}

                {/* Last 10 */}
                {form.last_10 && (
                  <div className="text-center">
                    <div className="text-sm font-bold text-gray-800 dark:text-gray-200">
                      {form.last_10.wins}W-{form.last_10.losses}L
                      <span className="text-xs text-gray-400 ml-1">({Math.round(form.last_10.win_rate * 100)}%)</span>
                    </div>
                    <div className="text-xs text-gray-400">Last 10</div>
                  </div>
                )}

                {/* Best win streak */}
                {form.best_win_streak !== undefined && (
                  <div className="text-center">
                    <div className="text-sm font-bold text-green-500">{form.best_win_streak}W</div>
                    <div className="text-xs text-gray-400">Best</div>
                  </div>
                )}

                {/* Worst loss streak */}
                {form.worst_loss_streak !== undefined && (
                  <div className="text-center">
                    <div className="text-sm font-bold text-red-500">{form.worst_loss_streak}L</div>
                    <div className="text-xs text-gray-400">Worst</div>
                  </div>
                )}

                {/* Trend */}
                {form.trend && (
                  <div className="text-center">
                    <div className={`text-lg font-bold ${
                      form.trend === "improving" ? "text-green-500" :
                      form.trend === "declining" ? "text-red-500" :
                      "text-gray-400"
                    }`}>
                      {form.trend === "improving" ? "\u2191" : form.trend === "declining" ? "\u2193" : "\u2192"}
                    </div>
                    <div className="text-xs text-gray-400">Trend</div>
                  </div>
                )}
              </div>
            </div>
          )}

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
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
              {canEditPhysical ? "Click a value to edit. Changes save on blur." : "Physical stats are maintained by admins."}
            </p>
          </div>
        </>
      )}

      {/* Tab 2: History */}
      {activeTab === "history" && (
        <>
          {gameHistory && (
            <div className="card mb-6">
              <h2 className="text-sm font-semibold text-court-600 uppercase tracking-wide mb-3">Game History</h2>
              {gameHistory.length > 0 ? (
                <div className="max-h-80 overflow-y-auto space-y-1">
                  {gameHistory.map((g) => {
                    const date = new Date(g.game_date);
                    const shortDate = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                    return (
                      <Link
                        key={g.game_id}
                        to={`/games/${g.game_id}`}
                        className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        <span className="text-xs text-gray-400 w-14 shrink-0">{shortDate}</span>
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate flex-1">
                          {g.team_name}
                        </span>
                        <span className="text-xs text-gray-400 shrink-0">vs</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 truncate flex-1">
                          {g.opponent_team}
                        </span>
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                          g.won
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        }`}>
                          {g.won ? "W" : "L"}
                        </span>
                        {g.score && (
                          <span className="text-xs text-gray-400 shrink-0">{g.score}</span>
                        )}
                        {g.awards?.length > 0 && (
                          <span className="text-xs shrink-0">
                            {g.awards.map((a) =>
                              a === "mvp" ? "\uD83C\uDFC6" : a === "xfactor" ? "\u26A1" : a === "shaqtin" ? "\uD83E\uDD26" : ""
                            ).join("")}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No games played yet</p>
              )}
            </div>
          )}
          {!gameHistory && (
            <p className="text-sm text-gray-400">No game history available</p>
          )}
        </>
      )}

      {/* Tab 3: Matchups */}
      {activeTab === "matchups" && (
        <>
          {matchups && (matchups.best_teammates?.length > 0 || matchups.toughest_opponents?.length > 0) ? (
            <div className="card mb-6">
              <h2 className="text-sm font-semibold text-court-600 uppercase tracking-wide mb-2">
                {isOwnProfile ? "Your Stats" : `${player.full_name}'s Stats`}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                <div className="text-center">
                  <div className="text-2xl font-black text-court-600">{((player.win_rate || 0.5) * 100).toFixed(0)}%</div>
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {matchups.best_teammates?.length > 0 && (
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                    <h3 className="text-xs font-bold text-green-500 uppercase tracking-wider mb-2">Best Teammates</h3>
                    <div className="space-y-2">
                      {(showAllTeammates ? matchups.best_teammates : matchups.best_teammates.slice(0, 5)).map((m) => (
                        <div key={m.player_id} className="flex items-center gap-2">
                          {m.avatar_url && <AvatarBadge avatarId={m.avatar_url} size="xs" />}
                          <span className="text-sm font-medium text-gray-800 dark:text-gray-200 flex-1">{m.full_name}</span>
                          <span className="text-sm font-bold text-green-500">{(m.win_rate * 100).toFixed(0)}%</span>
                          <span className="text-xs text-gray-400">{m.wins}W-{m.games - m.wins}L</span>
                        </div>
                      ))}
                    </div>
                    {matchups.best_teammates.length > 5 && (
                      <button
                        onClick={() => setShowAllTeammates(!showAllTeammates)}
                        className="text-xs text-court-600 hover:text-court-700 mt-2 font-medium"
                      >
                        {showAllTeammates ? "Show less" : `Show all (${matchups.best_teammates.length})`}
                      </button>
                    )}
                  </div>
                )}
                {matchups.toughest_opponents?.length > 0 && (
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                    <h3 className="text-xs font-bold text-red-500 uppercase tracking-wider mb-2">Toughest Opponents</h3>
                    <div className="space-y-2">
                      {(showAllOpponents ? matchups.toughest_opponents : matchups.toughest_opponents.slice(0, 5)).map((m) => (
                        <div key={m.player_id} className="flex items-center gap-2">
                          {m.avatar_url && <AvatarBadge avatarId={m.avatar_url} size="xs" />}
                          <span className="text-sm font-medium text-gray-800 dark:text-gray-200 flex-1">{m.full_name}</span>
                          <span className="text-sm font-bold text-red-500">{(m.win_rate * 100).toFixed(0)}%</span>
                          <span className="text-xs text-gray-400">{m.wins}W-{m.games - m.wins}L</span>
                        </div>
                      ))}
                    </div>
                    {matchups.toughest_opponents.length > 5 && (
                      <button
                        onClick={() => setShowAllOpponents(!showAllOpponents)}
                        className="text-xs text-court-600 hover:text-court-700 mt-2 font-medium"
                      >
                        {showAllOpponents ? "Show less" : `Show all (${matchups.toughest_opponents.length})`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">No matchup data available yet</p>
          )}
        </>
      )}

      {/* Tab 4: Ratings (admin-only) — Dynamic metrics from CustomMetric definitions */}
      {activeTab === "ratings" && isAdmin && (
        <>
          {customMetrics.length > 0 ? (
            <div className="grid gap-4 mb-6 grid-cols-2 md:grid-cols-4">
              {customMetrics.map((metric) => {
                const val = metricValueMap[metric.id];
                return (
                  <StatCard
                    key={metric.id}
                    label={metric.display_name}
                    value={val != null ? val.toFixed(1) : "N/A"}
                    max={`${metric.max_value || 10}.0`}
                  />
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-400 mb-6">
              No custom metrics defined for this run. Add metrics in Admin &rarr; Balancer.
            </p>
          )}

          {/* Admin metric editor */}
          {customMetrics.length > 0 && (
            <div className="card">
              <h2 className="text-lg font-semibold mb-1">Edit Metrics</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Adjust this player's metric values (1-10 scale).
              </p>
              <div className="space-y-4">
                {customMetrics.map((metric) => {
                  const pm = playerMetrics.find((m) => m.metric_id === metric.id);
                  const currentVal = pm?.value ?? metric.default_value ?? 5;
                  return (
                    <MetricSlider
                      key={metric.id}
                      label={metric.display_name}
                      value={currentVal}
                      min={metric.min_value || 1}
                      max={metric.max_value || 10}
                      onChange={async (newVal) => {
                        try {
                          await updatePlayerMetrics(runId, id, [{ metric_id: metric.id, value: newVal }]);
                          setPlayerMetrics((prev) => {
                            const existing = prev.find((m) => m.metric_id === metric.id);
                            if (existing) {
                              return prev.map((m) => m.metric_id === metric.id ? { ...m, value: newVal } : m);
                            }
                            return [...prev, { metric_id: metric.id, value: newVal, display_name: metric.display_name }];
                          });
                          toast.success("Updated");
                        } catch {
                          toast.error("Failed to update metric");
                        }
                      }}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </>
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

function MetricSlider({ label, value, min, max, onChange }) {
  const [localVal, setLocalVal] = useState(value);

  useEffect(() => { setLocalVal(value); }, [value]);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
        <span className="text-sm font-bold text-court-600">{localVal.toFixed(1)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step="0.5"
        value={localVal}
        onChange={(e) => setLocalVal(parseFloat(e.target.value))}
        onMouseUp={() => onChange(localVal)}
        onTouchEnd={() => onChange(localVal)}
        className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-court-500"
      />
      <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
