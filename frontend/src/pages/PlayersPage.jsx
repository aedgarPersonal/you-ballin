/**
 * Players List Page with Leaderboard
 * ===================================
 * Browse all approved players with sortable leaderboard view.
 * Admins can import players via a modal and edit ratings inline.
 */

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import useRunStore from "../stores/runStore";
import useAuthStore from "../stores/authStore";
import { listPlayers } from "../api/players";
import { updatePlayerAdmin, importPlayers } from "../api/admin";
import { listCustomMetrics } from "../api/algorithm";
import { getPlayerMetrics, updatePlayerMetrics } from "../api/algorithm";
import { AvatarBadge } from "../components/AvatarPicker";
import toast from "react-hot-toast";

const SORT_OPTIONS = [
  { value: "name", label: "Name" },
  { value: "jordan_factor", label: "Win Rate" },
  { value: "games_won", label: "Total Wins" },
  { value: "games_played", label: "Games Played" },
  { value: "mvp_count", label: "MVP Awards" },
  { value: "xfactor_count", label: "X Factor Awards" },
];

const ADMIN_SORT_OPTIONS = [
  ...SORT_OPTIONS,
  { value: "avg_overall", label: "Overall Rating" },
];

function formatHeight(inches) {
  if (!inches) return null;
  const ft = Math.floor(inches / 12);
  const rem = inches % 12;
  return `${ft}'${rem}"`;
}

function parseImportText(text) {
  if (!text.trim()) return [];
  return text
    .trim()
    .split("\n")
    .map((line) => {
      const parts = line.includes("\t") ? line.split("\t") : line.split(",");
      const name = (parts[0] || "").trim();
      const wins = parseInt(parts[1]) || 0;
      const losses = parseInt(parts[2]) || 0;
      return name ? { name, wins, losses } : null;
    })
    .filter(Boolean);
}

export default function PlayersPage() {
  const { currentRun, isRunAdmin } = useRunStore();
  const runId = currentRun?.id;
  const currentUser = useAuthStore((s) => s.user);
  const isAdmin = currentUser?.role === "super_admin" || isRunAdmin;
  const [players, setPlayers] = useState([]);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("jordan_factor");
  const [loading, setLoading] = useState(true);
  const [customMetrics, setCustomMetrics] = useState([]);
  const [playerMetricsMap, setPlayerMetricsMap] = useState({});
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  // Load custom metrics definitions for this run
  useEffect(() => {
    if (!runId || !isAdmin) return;
    listCustomMetrics(runId)
      .then(({ data }) => setCustomMetrics(data.metrics || []))
      .catch(() => setCustomMetrics([]));
  }, [runId, isAdmin]);

  const fetchPlayers = async () => {
    if (!runId) { setLoading(false); return; }
    try {
      const { data } = await listPlayers(runId, { search: search || undefined });
      setPlayers(data.users);

      if (isAdmin && customMetrics.length > 0) {
        const metricsEntries = await Promise.all(
          data.users.map(async (p) => {
            try {
              const { data: pm } = await getPlayerMetrics(runId, p.id);
              return [p.id, pm.metrics];
            } catch {
              return [p.id, []];
            }
          })
        );
        setPlayerMetricsMap(Object.fromEntries(metricsEntries));
      }
    } catch {
      setPlayers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const debounce = setTimeout(fetchPlayers, 300);
    return () => clearTimeout(debounce);
  }, [runId, search, isAdmin, customMetrics.length]);

  const handleImport = async () => {
    const parsed = parseImportText(importText);
    if (parsed.length === 0) return;
    if (!confirm(`Import ${parsed.length} player(s) with default password 'Password123'?`)) return;
    setImporting(true);
    try {
      const { data } = await importPlayers(runId, { players: parsed });
      setImportResult(data);
      toast.success(`${data.created_count} player(s) imported`);
      if (data.created_count > 0) {
        setImportText("");
        fetchPlayers();
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  if (!currentRun) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 text-center">
        <p className="text-gray-500 dark:text-gray-400">Please select a Run from the dropdown above.</p>
      </div>
    );
  }

  const sortedPlayers = [...players].sort((a, b) => {
    if (sortBy === "name") return a.full_name.localeCompare(b.full_name);
    return (b[sortBy] || 0) - (a[sortBy] || 0);
  });

  const isRanked = sortBy !== "name";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Players</h1>
          {currentRun && <p className="text-sm text-court-600">{currentRun.name}</p>}
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <button
              onClick={() => { setShowImport(true); setImportResult(null); }}
              className="bg-court-500 hover:bg-court-600 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
            >
              Import Players
            </button>
          )}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-lg px-3 py-2"
          >
            {(isAdmin ? ADMIN_SORT_OPTIONS : SORT_OPTIONS).map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Search players..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input w-48"
          />
        </div>
      </div>

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-lg w-full shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Import Players</h2>
              <button onClick={() => setShowImport(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-white text-2xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                Paste player data below (one per line):
              </p>
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-2 mb-3 text-xs font-mono text-gray-600 dark:text-gray-400 space-y-0.5">
                <p>Name, Wins, Losses</p>
                <p>Name{"\t"}Wins{"\t"}Losses</p>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
                Players get a random avatar, default password <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">Password123</code>, and Regular status.
              </p>
              <textarea
                rows={10}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 font-mono focus:ring-2 focus:ring-court-500 focus:border-court-500 dark:bg-gray-700 dark:text-gray-200"
                placeholder={`Bryan, 26, 14\nJulien, 23, 12\nDenis, 23, 17`}
              />
              <div className="flex items-center justify-between mt-4">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {parseImportText(importText).length} player(s) detected
                </span>
                <button
                  onClick={handleImport}
                  disabled={importing || !importText.trim()}
                  className={`font-medium py-2 px-6 rounded-lg transition-colors ${
                    importing || !importText.trim()
                      ? "bg-gray-200 dark:bg-gray-600 text-gray-400 cursor-not-allowed"
                      : "bg-court-500 hover:bg-court-600 text-white"
                  }`}
                >
                  {importing ? "Importing..." : "Import Players"}
                </button>
              </div>

              {/* Import Results */}
              {importResult && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-2 text-center">
                      <div className="text-xl font-bold text-green-700 dark:text-green-400">{importResult.created_count}</div>
                      <div className="text-xs text-green-600 dark:text-green-500">Created</div>
                    </div>
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-2 text-center">
                      <div className="text-xl font-bold text-yellow-700 dark:text-yellow-400">{importResult.skipped_count}</div>
                      <div className="text-xs text-yellow-600 dark:text-yellow-500">Skipped</div>
                    </div>
                  </div>
                  {importResult.created_players.length > 0 && (
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      <span className="font-medium text-green-700 dark:text-green-400">Created:</span> {importResult.created_players.join(", ")}
                    </p>
                  )}
                  {importResult.skipped_players.length > 0 && (
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      <span className="font-medium text-yellow-700 dark:text-yellow-400">Skipped:</span> {importResult.skipped_players.join(", ")}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 dark:text-gray-400">Loading players...</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedPlayers.map((player, idx) => {
            const Wrapper = isAdmin ? "div" : Link;
            const wrapperProps = isAdmin
              ? { className: "card hover:shadow-md transition-shadow" }
              : { to: `/players/${player.id}`, className: "card hover:shadow-md transition-shadow" };
            const pMetrics = playerMetricsMap[player.id] || [];
            const height = formatHeight(player.height_inches);

            return (
              <Wrapper key={player.id} {...wrapperProps}>
                <Link to={`/players/${player.id}`} className="flex items-center gap-4">
                  {isRanked && (
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black shrink-0 ${
                      idx === 0 ? "bg-yellow-400 text-yellow-900" :
                      idx === 1 ? "bg-gray-300 text-gray-700" :
                      idx === 2 ? "bg-orange-300 text-orange-800" :
                      "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                    }`}>
                      {idx + 1}
                    </div>
                  )}
                  {player.avatar_url ? (
                    <AvatarBadge avatarId={player.avatar_url} size="md" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-court-100 flex items-center justify-center text-court-600 font-bold text-lg">
                      {player.full_name.charAt(0)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {player.full_name}
                      {player.email && (
                        <span className="text-xs font-normal text-gray-400 dark:text-gray-500 ml-1">
                          ({player.email})
                        </span>
                      )}
                    </h3>
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                      <span className={`badge-${player.player_status}`}>
                        {player.player_status}
                      </span>
                      {height && <span>{height}</span>}
                      {player.age && <span>Age {player.age}</span>}
                    </div>
                  </div>
                </Link>

                {/* Award Trophies */}
                {(player.mvp_count > 0 || player.xfactor_count > 0 || player.shaqtin_count > 0) && (
                  <div className="flex gap-3 mt-3 flex-wrap">
                    {player.mvp_count > 0 && (
                      <div className="flex items-center gap-1.5 bg-gradient-to-r from-yellow-50 to-yellow-100 dark:from-yellow-900/20 dark:to-yellow-900/30 border border-yellow-300 dark:border-yellow-700 rounded-lg px-3 py-1.5">
                        <span className="text-lg">🏆</span>
                        <div className="leading-tight">
                          <div className="text-sm font-bold text-yellow-800">{player.mvp_count}</div>
                          <div className="text-[10px] font-medium text-yellow-600 uppercase tracking-wider">MVP</div>
                        </div>
                      </div>
                    )}
                    {player.xfactor_count > 0 && (
                      <div className="flex items-center gap-1.5 bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-900/30 border border-blue-300 dark:border-blue-700 rounded-lg px-3 py-1.5">
                        <span className="text-lg">⚡</span>
                        <div className="leading-tight">
                          <div className="text-sm font-bold text-blue-800">{player.xfactor_count}</div>
                          <div className="text-[10px] font-medium text-blue-600 uppercase tracking-wider">X Factor</div>
                        </div>
                      </div>
                    )}
                    {player.shaqtin_count > 0 && (
                      <div className="flex items-center gap-1.5 bg-gradient-to-r from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-900/30 border border-purple-300 dark:border-purple-700 rounded-lg px-3 py-1.5">
                        <span className="text-lg">🤦</span>
                        <div className="leading-tight">
                          <div className="text-sm font-bold text-purple-800">{player.shaqtin_count}</div>
                          <div className="text-[10px] font-medium text-purple-600 uppercase tracking-wider">Shaqtin'</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Stats Grid */}
                <div className={`grid gap-2 mt-3 text-center ${isAdmin ? "grid-cols-5" : "grid-cols-2"}`}>
                  {isAdmin && [
                    { key: "avg_offense", label: "OFF", val: player.avg_offense, min: 1, max: 5, step: 0.5 },
                    { key: "avg_defense", label: "DEF", val: player.avg_defense, min: 1, max: 5, step: 0.5 },
                    { key: "avg_overall", label: "OVR", val: player.avg_overall, min: 1, max: 5, step: 0.5 },
                  ].map((stat) => (
                    <div key={stat.key}>
                      <input
                        type="number"
                        step={stat.step}
                        min={stat.min}
                        max={stat.max}
                        defaultValue={stat.val?.toFixed(1)}
                        onBlur={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val) && val !== stat.val) {
                            updatePlayerAdmin(runId, player.id, { [stat.key]: val })
                              .then(() => toast.success("Updated"))
                              .catch(() => toast.error("Failed"));
                          }
                        }}
                        className="w-full text-sm font-bold text-court-600 text-center border border-transparent hover:border-gray-300 dark:hover:border-gray-600 rounded bg-transparent focus:border-court-500 focus:outline-none"
                      />
                      <div className="text-xs text-gray-400 dark:text-gray-500">{stat.label}</div>
                    </div>
                  ))}
                  <div>
                    <div className="text-sm font-bold text-court-600">{((player.jordan_factor || 0.5) * 100).toFixed(0)}%</div>
                    <div className="text-xs text-gray-400 dark:text-gray-500">WIN</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-court-600">
                      {player.games_won || 0}-{(player.games_played || 0) - (player.games_won || 0)}
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500">W-L</div>
                  </div>
                </div>

                {/* Custom Metrics (admin-editable) */}
                {isAdmin && pMetrics.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 text-center">
                    {pMetrics.map((m) => (
                      <div key={m.metric_id}>
                        <input
                          type="number"
                          step="0.5"
                          min={m.min_value}
                          max={m.max_value}
                          defaultValue={m.value?.toFixed(1)}
                          onBlur={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val) && val !== m.value) {
                              updatePlayerMetrics(runId, player.id, [{ metric_id: m.metric_id, value: val }])
                                .then(() => {
                                  toast.success("Updated");
                                  setPlayerMetricsMap((prev) => ({
                                    ...prev,
                                    [player.id]: prev[player.id].map((pm) =>
                                      pm.metric_id === m.metric_id ? { ...pm, value: val } : pm
                                    ),
                                  }));
                                })
                                .catch(() => toast.error("Failed"));
                            }
                          }}
                          className="w-full text-sm font-bold text-court-600 text-center border border-transparent hover:border-gray-300 dark:hover:border-gray-600 rounded bg-transparent focus:border-court-500 focus:outline-none"
                        />
                        <div className="text-xs text-gray-400 dark:text-gray-500 truncate" title={m.display_name}>
                          {m.display_name}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Wrapper>
            );
          })}
        </div>
      )}
    </div>
  );
}
