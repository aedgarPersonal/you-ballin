/**
 * Player Profile Page — Trading Card Style
 * ==========================================
 * Top section styled as a retro basketball trading card with the player's
 * avatar, name, physical stats, and key numbers. Heavier data (history,
 * matchups, ratings) loads lazily when the user clicks a tab.
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
  const [form, setForm] = useState(null);
  const updateUser = useAuthStore((s) => s.updateUser);
  const [activeTab, setActiveTab] = useState("history");

  // Lazy-loaded tab data
  const [matchups, setMatchups] = useState(null);
  const [matchupsLoading, setMatchupsLoading] = useState(false);
  const [gameHistory, setGameHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [customMetrics, setCustomMetrics] = useState([]);
  const [playerMetrics, setPlayerMetrics] = useState([]);
  const [ratingsLoading, setRatingsLoading] = useState(false);
  const [showAllTeammates, setShowAllTeammates] = useState(false);
  const [showAllOpponents, setShowAllOpponents] = useState(false);

  const isOwnProfile = currentUser?.id === parseInt(id);
  const { isRunAdmin } = useRunStore();
  const isAdmin = currentUser?.role === "super_admin" || currentUser?.role === "admin" || isRunAdmin;
  const canEditPhysical = isAdmin || isOwnProfile;

  const TABS = [
    { id: "history", label: "History" },
    { id: "matchups", label: "Matchups" },
    ...(isAdmin ? [{ id: "ratings", label: "Ratings" }] : []),
  ];

  // Fast initial load — just player + form (for the card)
  useEffect(() => {
    setLoading(true);
    const fetches = [getPlayer(id, runId)];
    if (runId) fetches.push(getPlayerForm(runId, id));

    Promise.allSettled(fetches).then((results) => {
      if (results[0].status === "fulfilled") setPlayer(results[0].value.data);
      if (results[1]?.status === "fulfilled") setForm(results[1].value.data);
      setLoading(false);
    });
  }, [id, runId]);

  // Lazy tab fetching
  useEffect(() => {
    if (!runId) return;
    if (activeTab === "history" && !gameHistory && !historyLoading) {
      setHistoryLoading(true);
      getPlayerGameHistory(runId, id)
        .then(({ data }) => setGameHistory(data))
        .catch(() => setGameHistory([]))
        .finally(() => setHistoryLoading(false));
    }
    if (activeTab === "matchups" && !matchups && !matchupsLoading) {
      setMatchupsLoading(true);
      getPlayerMatchups(runId, id)
        .then(({ data }) => setMatchups(data))
        .catch(() => setMatchups({}))
        .finally(() => setMatchupsLoading(false));
    }
    if (activeTab === "ratings" && isAdmin && customMetrics.length === 0 && !ratingsLoading) {
      setRatingsLoading(true);
      Promise.all([listCustomMetrics(runId), getPlayerMetrics(runId, id)])
        .then(([metricsRes, playerMetricsRes]) => {
          setCustomMetrics(metricsRes.data.metrics || metricsRes.data || []);
          setPlayerMetrics(playerMetricsRes.data.metrics || []);
        })
        .catch(() => {})
        .finally(() => setRatingsLoading(false));
    }
  }, [activeTab, runId, id]);

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

  if (loading) return <div className="max-w-4xl mx-auto px-4 py-8 text-center text-gray-500">Loading...</div>;
  if (!player) return <div className="max-w-4xl mx-auto px-4 py-8 text-center text-gray-500">Player not found</div>;

  const legacy = getPlayerById(player.avatar_url);
  const heightFt = player.height_inches ? Math.floor(player.height_inches / 12) : null;
  const heightIn = player.height_inches ? player.height_inches % 12 : null;
  const winPct = ((player?.win_rate || 0.5) * 100).toFixed(0);
  const gamesPlayed = player?.games_played || 0;
  const gamesWon = player?.games_won || 0;
  const gamesLost = gamesPlayed - gamesWon;

  const metricValueMap = {};
  for (const pm of playerMetrics) metricValueMap[pm.metric_id] = pm.value;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

      {/* ==================== TRADING CARD ==================== */}
      <div className="relative mb-6">
        {/* Card outer border — retro gold frame */}
        <div className="rounded-2xl bg-gradient-to-b from-amber-300 via-yellow-400 to-amber-500 p-[3px] shadow-xl">
          <div className="rounded-[13px] bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 overflow-hidden">

            {/* Scanline overlay */}
            <div
              className="absolute inset-0 pointer-events-none opacity-[0.03] z-10 rounded-2xl"
              style={{
                backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.4) 2px, rgba(0,0,0,0.4) 4px)",
              }}
            />

            {/* Card header strip */}
            <div className="bg-gradient-to-r from-arcade-700 via-arcade-600 to-court-600 px-5 py-2 flex items-center justify-between">
              <span className="font-retro text-[7px] text-white/70 tracking-widest uppercase">Double Dribble</span>
              <span className="font-retro text-[7px] text-white/70 tracking-wider">
                {currentRun?.name || ""}
              </span>
            </div>

            {/* Card body */}
            <div className="px-5 pt-5 pb-4">
              <div className="flex gap-5">
                {/* Avatar column */}
                <div className="flex flex-col items-center shrink-0">
                  <div className="relative">
                    <div className="rounded-xl bg-gradient-to-br from-court-400/20 to-arcade-400/20 p-1">
                      <button
                        onClick={isOwnProfile ? () => setShowAvatarPicker(true) : undefined}
                        className={`block rounded-lg overflow-hidden ${isOwnProfile ? "cursor-pointer hover:opacity-90 transition-opacity" : ""}`}
                      >
                        {legacy ? (
                          <AvatarBadge avatarId={player.avatar_url} size="lg" />
                        ) : (
                          <div className="w-20 h-20 rounded-lg bg-gradient-to-br from-court-500 to-arcade-500 flex items-center justify-center text-white font-bold text-3xl">
                            {player.full_name.charAt(0)}
                          </div>
                        )}
                      </button>
                    </div>
                    {/* Rating badge */}
                    <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-full bg-gradient-to-br from-court-500 to-court-600 border-2 border-gray-950 flex items-center justify-center shadow-lg">
                      <span className="font-retro text-[10px] text-white">{player?.player_rating || 50}</span>
                    </div>
                  </div>

                  {legacy && (
                    <span className="text-[9px] text-gray-500 mt-2.5 text-center">{legacy.name}</span>
                  )}
                  {isOwnProfile && (
                    <button onClick={() => setShowAvatarPicker(true)} className="text-[9px] text-court-500 hover:text-court-400 mt-0.5">
                      Change
                    </button>
                  )}
                </div>

                {/* Info column */}
                <div className="flex-1 min-w-0">
                  <h1 className="font-retro text-base text-white leading-tight truncate">
                    {player.full_name.toUpperCase()}
                  </h1>
                  <p className="text-xs text-gray-500 mt-0.5">@{player.username}</p>

                  {/* Position */}
                  <div className="flex items-center gap-2 mt-1.5">
                    {(isOwnProfile || isAdmin) ? (
                      <PositionSelector
                        value={player.position || "Mascot"}
                        onChange={async (newPos) => {
                          const save = isOwnProfile
                            ? updateMyProfile({ position: newPos }).then(() => updateUser({ position: newPos }))
                            : updatePlayerAdmin(runId, player.id, { position: newPos });
                          save.then(() => { setPlayer({ ...player, position: newPos }); toast.success("Position updated"); })
                            .catch(() => toast.error("Failed"));
                        }}
                      />
                    ) : (
                      <span className="text-[10px] font-bold text-arcade-400 border border-arcade-600/40 rounded px-1.5 py-0.5">
                        {player.position || "Mascot"}
                      </span>
                    )}
                  </div>

                  {/* Physical stats */}
                  <div className="flex items-center gap-3 mt-2">
                    {canEditPhysical ? (
                      <>
                        <div className="flex items-center gap-0.5 text-xs text-gray-400">
                          <input type="number" min="3" max="7"
                            defaultValue={heightFt || ""}
                            placeholder="ft"
                            onBlur={(e) => {
                              const ft = parseInt(e.target.value) || 0;
                              const inch = player.height_inches ? player.height_inches % 12 : 0;
                              const total = ft * 12 + inch;
                              if (total > 0 && total !== player.height_inches) {
                                const save = isOwnProfile
                                  ? updateMyProfile({ height_inches: total }).then(() => updateUser({ height_inches: total }))
                                  : updatePlayerAdmin(runId, player.id, { height_inches: total });
                                save.then(() => { setPlayer({ ...player, height_inches: total }); toast.success("Height updated"); })
                                  .catch(() => toast.error("Failed"));
                              }
                            }}
                            className="w-8 text-center text-xs bg-transparent border border-gray-700 rounded px-1 py-0.5 text-gray-300 focus:border-court-500 focus:outline-none"
                          />'
                          <input type="number" min="0" max="11"
                            defaultValue={heightIn ?? ""}
                            placeholder="in"
                            onBlur={(e) => {
                              const inch = parseInt(e.target.value) || 0;
                              const ft = player.height_inches ? Math.floor(player.height_inches / 12) : 5;
                              const total = ft * 12 + inch;
                              if (total > 0 && total !== player.height_inches) {
                                const save = isOwnProfile
                                  ? updateMyProfile({ height_inches: total }).then(() => updateUser({ height_inches: total }))
                                  : updatePlayerAdmin(runId, player.id, { height_inches: total });
                                save.then(() => { setPlayer({ ...player, height_inches: total }); toast.success("Height updated"); })
                                  .catch(() => toast.error("Failed"));
                              }
                            }}
                            className="w-8 text-center text-xs bg-transparent border border-gray-700 rounded px-1 py-0.5 text-gray-300 focus:border-court-500 focus:outline-none"
                          />"
                        </div>
                        <div className="flex items-center gap-1 text-xs text-gray-400">
                          <span>Age</span>
                          <input type="number" min="16" max="70"
                            defaultValue={player.age || ""}
                            placeholder="—"
                            onBlur={(e) => {
                              const val = parseInt(e.target.value) || null;
                              if (val !== player.age) {
                                const save = isOwnProfile
                                  ? updateMyProfile({ age: val }).then(() => updateUser({ age: val }))
                                  : updatePlayerAdmin(runId, player.id, { age: val });
                                save.then(() => { setPlayer({ ...player, age: val }); toast.success("Age updated"); })
                                  .catch(() => toast.error("Failed"));
                              }
                            }}
                            className="w-10 text-center text-xs bg-transparent border border-gray-700 rounded px-1 py-0.5 text-gray-300 focus:border-court-500 focus:outline-none"
                          />
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-3 text-xs text-gray-400">
                        {heightFt && <span>{heightFt}'{heightIn}"</span>}
                        {player.age && <span>Age {player.age}</span>}
                      </div>
                    )}
                  </div>

                  {/* Status badge */}
                  <div className="flex items-center gap-2 mt-2">
                    {isAdmin ? (
                      <select
                        value={player.player_status}
                        onChange={async (e) => {
                          const newStatus = e.target.value;
                          const oldStatus = player.player_status;
                          setPlayer((prev) => ({ ...prev, player_status: newStatus }));
                          try {
                            await updatePlayerAdmin(runId, player.id, { player_status: newStatus });
                            toast.success(`Status → ${newStatus}`);
                          } catch {
                            setPlayer((prev) => ({ ...prev, player_status: oldStatus }));
                            toast.error("Update failed");
                          }
                        }}
                        className="font-retro text-[8px] border border-gray-700 rounded px-1.5 py-0.5 bg-gray-800 text-gray-200"
                      >
                        <option value="regular">Regular</option>
                        <option value="dropin">Drop-in</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    ) : (
                      <span className={`badge-${player.player_status}`}>{player.player_status}</span>
                    )}
                    {isOwnProfile && <span className="text-[10px] font-bold text-court-400 border border-court-500/40 rounded px-1.5 py-0.5">YOU</span>}
                    {isAdmin && (
                      <button
                        onClick={async () => {
                          const newVal = !player.dues_paid;
                          setPlayer((prev) => ({ ...prev, dues_paid: newVal }));
                          try {
                            await updatePlayerAdmin(runId, player.id, { dues_paid: newVal });
                            toast.success(newVal ? "Dues marked paid" : "Dues marked unpaid");
                          } catch {
                            setPlayer((prev) => ({ ...prev, dues_paid: !newVal }));
                            toast.error("Failed");
                          }
                        }}
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          player.dues_paid
                            ? "bg-green-500/30 text-green-300 border border-green-500/40"
                            : "bg-red-500/30 text-red-300 border border-red-500/40"
                        }`}
                      >
                        {player.dues_paid ? "DUES PAID" : "DUES UNPAID"}
                      </button>
                    )}
                  </div>

                  {/* Editable contact for own profile */}
                  {isOwnProfile && (
                    <div className="flex flex-col sm:flex-row gap-1.5 mt-2">
                      <input
                        type="email" defaultValue={player.email} placeholder="Email"
                        onBlur={(e) => {
                          const val = e.target.value.trim();
                          if (val && val !== player.email) {
                            updateMyProfile({ email: val })
                              .then(() => { setPlayer({ ...player, email: val }); updateUser({ email: val }); toast.success("Email updated"); })
                              .catch((err) => { e.target.value = player.email; toast.error(err.response?.data?.detail || "Failed"); });
                          }
                        }}
                        className="text-xs bg-transparent border border-gray-700 rounded px-2 py-1 text-gray-300 focus:border-court-500 focus:outline-none"
                      />
                      <input
                        type="tel" defaultValue={player.phone || ""} placeholder="Phone"
                        onBlur={(e) => {
                          const val = e.target.value.trim() || null;
                          if (val !== (player.phone || null)) {
                            updateMyProfile({ phone: val })
                              .then(() => { setPlayer({ ...player, phone: val }); updateUser({ phone: val }); toast.success("Phone updated"); })
                              .catch(() => toast.error("Failed"));
                          }
                        }}
                        className="text-xs bg-transparent border border-gray-700 rounded px-2 py-1 text-gray-300 focus:border-court-500 focus:outline-none"
                      />
                    </div>
                  )}
                  {!isOwnProfile && (
                    <p className="text-[10px] text-gray-600 mt-1">{player.email}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Stats strip at bottom of card */}
            <div className="bg-gray-800/50 border-t border-gray-700/50 px-5 py-3">
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <div className="font-retro text-[10px] text-court-400">{winPct}%</div>
                  <div className="text-[8px] text-gray-500 uppercase tracking-wider mt-0.5">Win</div>
                </div>
                <div>
                  <div className="font-retro text-[10px] text-white">{gamesWon}-{gamesLost}</div>
                  <div className="text-[8px] text-gray-500 uppercase tracking-wider mt-0.5">W-L</div>
                </div>
                <div>
                  <div className="font-retro text-[10px] text-white">{gamesPlayed}</div>
                  <div className="text-[8px] text-gray-500 uppercase tracking-wider mt-0.5">GP</div>
                </div>
                <div>
                  {form?.current_streak?.count > 0 ? (
                    <div className={`font-retro text-[10px] ${form.current_streak.type === "win" ? "text-green-400" : "text-red-400"}`}>
                      {form.current_streak.count}{form.current_streak.type === "win" ? "W" : "L"}
                    </div>
                  ) : (
                    <div className="font-retro text-[10px] text-gray-600">—</div>
                  )}
                  <div className="text-[8px] text-gray-500 uppercase tracking-wider mt-0.5">Streak</div>
                </div>
              </div>

              {/* Awards row */}
              {(player?.mvp_count > 0 || player?.xfactor_count > 0 || player?.shaqtin_count > 0) && (
                <div className="flex items-center justify-center gap-4 mt-2 pt-2 border-t border-gray-700/50 text-xs">
                  {player.mvp_count > 0 && <span className="text-yellow-500 font-bold">{"\uD83C\uDFC6"} {player.mvp_count}</span>}
                  {player.xfactor_count > 0 && <span className="text-blue-400 font-bold">{"\u26A1"} {player.xfactor_count}</span>}
                  {player.shaqtin_count > 0 && <span className="text-purple-400 font-bold">{"\uD83E\uDD26"} {player.shaqtin_count}</span>}
                  {form?.best_win_streak > 0 && <span className="text-green-400">Best: {form.best_win_streak}W</span>}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* Avatar Picker Modal */}
      {showAvatarPicker && (
        <AvatarPicker
          value={player.avatar_url}
          onChange={(avatarId) => handleAvatarChange(avatarId)}
          onClose={() => setShowAvatarPicker(false)}
        />
      )}

      {/* ==================== TABS ==================== */}
      <div className="flex border-b border-gray-200 mb-6">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t.id
                ? "border-court-500 text-court-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: History */}
      {activeTab === "history" && (
        historyLoading ? (
          <p className="text-sm text-gray-400 text-center py-4">Loading history...</p>
        ) : gameHistory?.length > 0 ? (
          <div className="card">
            <h2 className="text-sm font-semibold text-court-600 uppercase tracking-wide mb-3">Game History</h2>
            <div className="max-h-80 overflow-y-auto space-y-1">
              {gameHistory.map((g) => {
                const shortDate = new Date(g.game_date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
                return (
                  <Link key={g.game_id} to={`/games/${g.game_id}`}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 transition-colors">
                    <span className="text-xs text-gray-400 w-14 shrink-0">{shortDate}</span>
                    <span className="text-xs font-medium text-gray-700 truncate flex-1">{g.team_name}</span>
                    <span className="text-xs text-gray-400 shrink-0">vs</span>
                    <span className="text-xs text-gray-500 truncate flex-1">{g.opponent_team}</span>
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                      g.won ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}>{g.won ? "W" : "L"}</span>
                    {g.score && <span className="text-xs text-gray-400 shrink-0">{g.score}</span>}
                    {g.awards?.length > 0 && (
                      <span className="text-xs shrink-0">
                        {g.awards.map((a) => a === "mvp" ? "\uD83C\uDFC6" : a === "xfactor" ? "\u26A1" : a === "shaqtin" ? "\uD83E\uDD26" : "").join("")}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4">No games played yet</p>
        )
      )}

      {/* Tab: Matchups */}
      {activeTab === "matchups" && (
        matchupsLoading ? (
          <p className="text-sm text-gray-400 text-center py-4">Loading matchups...</p>
        ) : matchups && (matchups.best_teammates?.length > 0 || matchups.toughest_opponents?.length > 0) ? (
          <div className="card">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {matchups.best_teammates?.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <h3 className="text-xs font-bold text-green-500 uppercase tracking-wider mb-2">Best Teammates</h3>
                  <div className="space-y-2">
                    {(showAllTeammates ? matchups.best_teammates : matchups.best_teammates.slice(0, 5)).map((m) => (
                      <div key={m.player_id} className="flex items-center gap-2">
                        {m.avatar_url && <AvatarBadge avatarId={m.avatar_url} size="xs" />}
                        <span className="text-sm font-medium text-gray-800 flex-1">{m.full_name}</span>
                        <span className="text-sm font-bold text-green-500">{(m.win_rate * 100).toFixed(0)}%</span>
                        <span className="text-xs text-gray-400">{m.wins}W-{m.games - m.wins}L</span>
                      </div>
                    ))}
                  </div>
                  {matchups.best_teammates.length > 5 && (
                    <button onClick={() => setShowAllTeammates(!showAllTeammates)}
                      className="text-xs text-court-600 hover:text-court-700 mt-2 font-medium">
                      {showAllTeammates ? "Show less" : `Show all (${matchups.best_teammates.length})`}
                    </button>
                  )}
                </div>
              )}
              {matchups.toughest_opponents?.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <h3 className="text-xs font-bold text-red-500 uppercase tracking-wider mb-2">Toughest Opponents</h3>
                  <div className="space-y-2">
                    {(showAllOpponents ? matchups.toughest_opponents : matchups.toughest_opponents.slice(0, 5)).map((m) => (
                      <div key={m.player_id} className="flex items-center gap-2">
                        {m.avatar_url && <AvatarBadge avatarId={m.avatar_url} size="xs" />}
                        <span className="text-sm font-medium text-gray-800 flex-1">{m.full_name}</span>
                        <span className="text-sm font-bold text-red-500">{(m.win_rate * 100).toFixed(0)}%</span>
                        <span className="text-xs text-gray-400">{m.wins}W-{m.games - m.wins}L</span>
                      </div>
                    ))}
                  </div>
                  {matchups.toughest_opponents.length > 5 && (
                    <button onClick={() => setShowAllOpponents(!showAllOpponents)}
                      className="text-xs text-court-600 hover:text-court-700 mt-2 font-medium">
                      {showAllOpponents ? "Show less" : `Show all (${matchups.toughest_opponents.length})`}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4">No matchup data available yet</p>
        )
      )}

      {/* Tab: Ratings (admin-only) */}
      {activeTab === "ratings" && isAdmin && (
        ratingsLoading ? (
          <p className="text-sm text-gray-400 text-center py-4">Loading ratings...</p>
        ) : (
          <>
            {customMetrics.length > 0 ? (
              <div className="grid gap-4 mb-6 grid-cols-2 md:grid-cols-4">
                {customMetrics.map((metric) => {
                  const val = metricValueMap[metric.id];
                  return (
                    <StatCard key={metric.id} label={metric.display_name}
                      value={val != null ? val.toFixed(1) : "N/A"} max={`${metric.max_value || 10}.0`} />
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-400 mb-6">
                No custom metrics defined for this run. Add metrics in Admin &rarr; Balancer.
              </p>
            )}
            {customMetrics.length > 0 && (
              <div className="card">
                <h2 className="text-lg font-semibold mb-1">Edit Metrics</h2>
                <p className="text-sm text-gray-500 mb-4">
                  Adjust this player's metric values (1-10 scale).
                </p>
                <div className="space-y-4">
                  {customMetrics.map((metric) => {
                    const pm = playerMetrics.find((m) => m.metric_id === metric.id);
                    const currentVal = pm?.value ?? metric.default_value ?? 5;
                    return (
                      <MetricSlider key={metric.id} label={metric.display_name}
                        value={currentVal} min={metric.min_value || 1} max={metric.max_value || 10}
                        onChange={async (newVal) => {
                          try {
                            await updatePlayerMetrics(runId, id, [{ metric_id: metric.id, value: newVal }]);
                            setPlayerMetrics((prev) => {
                              const existing = prev.find((m) => m.metric_id === metric.id);
                              if (existing) return prev.map((m) => m.metric_id === metric.id ? { ...m, value: newVal } : m);
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
        )
      )}
    </div>
  );
}

function StatCard({ label, value, max, highlight }) {
  return (
    <div className={`card text-center ${highlight ? "border-2 border-court-300" : ""}`}>
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-2xl font-bold ${highlight ? "text-court-600" : "text-gray-900"}`}>{value}</p>
      {max && <p className="text-xs text-gray-400">/ {max}</p>}
    </div>
  );
}

function MetricSlider({ label, value, min, max, onChange }) {
  const [localVal, setLocalVal] = useState(value);
  useEffect(() => { setLocalVal(value); }, [value]);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <span className="text-sm font-bold text-court-600">{localVal.toFixed(1)}</span>
      </div>
      <input type="range" min={min} max={max} step="0.5" value={localVal}
        onChange={(e) => setLocalVal(parseFloat(e.target.value))}
        onMouseUp={() => onChange(localVal)} onTouchEnd={() => onChange(localVal)}
        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-court-500"
      />
      <div className="flex justify-between text-xs text-gray-400">
        <span>{min}</span><span>{max}</span>
      </div>
    </div>
  );
}

const ALL_POSITIONS = ["PG", "SG", "SF", "PF", "C", "Mascot"];

function PositionSelector({ value, onChange }) {
  const selected = (value || "Mascot").split(",").map((p) => p.trim()).filter(Boolean);

  const toggle = (pos) => {
    let next;
    if (pos === "Mascot") {
      next = ["Mascot"];
    } else if (selected.includes(pos)) {
      next = selected.filter((p) => p !== pos);
      if (next.length === 0) next = ["Mascot"];
    } else {
      next = selected.filter((p) => p !== "Mascot");
      if (next.length >= 2) next = [next[1], pos];
      else next = [...next, pos];
    }
    onChange(next.join(","));
  };

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {ALL_POSITIONS.map((pos) => {
        const active = selected.includes(pos);
        return (
          <button key={pos} onClick={() => toggle(pos)}
            className={`text-[9px] font-bold px-1.5 py-0.5 rounded border transition-colors ${
              active
                ? "bg-arcade-600/30 border-arcade-500 text-arcade-300"
                : "bg-transparent border-gray-700 text-gray-600 hover:text-gray-400 hover:border-gray-500"
            }`}>
            {pos}
          </button>
        );
      })}
    </div>
  );
}
