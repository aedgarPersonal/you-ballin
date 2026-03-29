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
import { updatePlayerAdmin, importPlayers, quickAddPlayer } from "../api/admin";
import { listCustomMetrics } from "../api/algorithm";
import { getPlayerMetrics, updatePlayerMetrics } from "../api/algorithm";
import { AvatarBadge } from "../components/AvatarPicker";
import toast from "react-hot-toast";

const SORT_OPTIONS = [
  { value: "name", label: "Name" },
  { value: "player_rating", label: "Player Rating" },
  { value: "win_rate", label: "Win Rate" },
  { value: "games_won", label: "Total Wins" },
  { value: "games_played", label: "Games Played" },
  { value: "mvp_count", label: "MVP Awards" },
  { value: "xfactor_count", label: "X Factor Awards" },
  { value: "shaqtin_count", label: "Shaqtin' Awards" },
];

// Admin sort options are now just the base options — custom metrics
// are displayed but not sortable from the player object directly
const ADMIN_SORT_OPTIONS = [...SORT_OPTIONS];

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
      const email = (parts[1] || "").trim();
      if (!name || !email) return null;
      const entry = { name, email };
      // Optional fields: wins, losses, height_inches, age, scoring, defense, overall, athleticism, fitness
      if (parts[2]?.trim()) entry.wins = parseInt(parts[2]) || 0;
      if (parts[3]?.trim()) entry.losses = parseInt(parts[3]) || 0;
      if (parts[4]?.trim()) entry.height_inches = parseInt(parts[4]) || 70;
      if (parts[5]?.trim()) entry.age = parseInt(parts[5]) || 30;
      // Dynamic metrics: offense, defense, athleticism (columns 6-8)
      const metrics = {};
      if (parts[6]?.trim()) metrics.offense = parseFloat(parts[6]) || 5.0;
      if (parts[7]?.trim()) metrics.defense = parseFloat(parts[7]) || 5.0;
      if (parts[8]?.trim()) metrics.athleticism = parseFloat(parts[8]) || 5.0;
      if (Object.keys(metrics).length > 0) entry.metrics = metrics;
      return entry;
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
  const [sortBy, setSortBy] = useState("win_rate");
  const [loading, setLoading] = useState(true);
  const [customMetrics, setCustomMetrics] = useState([]);
  const [playerMetricsMap, setPlayerMetricsMap] = useState({});
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [statusFilters, setStatusFilters] = useState(new Set(["regular", "dropin"]));
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [addForm, setAddForm] = useState({
    full_name: "", email: "", phone: "", wins: 0, losses: 0,
    height_inches: 70, age: 30,
  });
  const [adding, setAdding] = useState(false);

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
      const { data } = await listPlayers(runId, {
        search: search || undefined,
        include_inactive: isAdmin ? true : undefined,
      });
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

  const handleAddPlayer = async () => {
    if (!addForm.full_name.trim() || !addForm.email.trim()) {
      toast.error("Name and email are required");
      return;
    }
    setAdding(true);
    try {
      await quickAddPlayer(runId, addForm);
      toast.success(`${addForm.full_name} added!`);
      setAddForm({
        full_name: "", email: "", phone: "", wins: 0, losses: 0,
        height_inches: 70, age: 30,
      });
      setShowAddPlayer(false);
      fetchPlayers();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to add player");
    } finally {
      setAdding(false);
    }
  };

  if (!currentRun) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 text-center">
        <p className="text-gray-500 dark:text-gray-400">Please select a Run from the dropdown above.</p>
      </div>
    );
  }

  const filteredPlayers = players.filter((p) => statusFilters.has(p.player_status));
  const sortedPlayers = [...filteredPlayers].sort((a, b) => {
    if (sortBy === "name") return a.full_name.localeCompare(b.full_name);
    return (b[sortBy] || 0) - (a[sortBy] || 0);
  });

  const isRanked = sortBy !== "name";

  const toggleFilter = (status) => {
    setStatusFilters((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  const statusCounts = { regular: 0, dropin: 0, inactive: 0 };
  for (const p of players) statusCounts[p.player_status] = (statusCounts[p.player_status] || 0) + 1;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Roster</h1>
            {currentRun && <p className="text-sm text-court-600">{currentRun.name}</p>}
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAddPlayer(true)}
                className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 px-3 rounded-lg transition-colors"
              >
                + Add
              </button>
              <button
                onClick={() => { setShowImport(true); setImportResult(null); }}
                className="bg-court-500 hover:bg-court-600 text-white text-sm font-medium py-2 px-3 rounded-lg transition-colors"
              >
                Import
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input flex-1 min-w-0"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-lg px-3 py-2 shrink-0"
          >
            {(isAdmin ? ADMIN_SORT_OPTIONS : SORT_OPTIONS).map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Status Filter Chips */}
      <div className="flex items-center gap-2 mb-4">
        {[
          { key: "regular", label: "Regular", color: "green" },
          { key: "dropin", label: "Drop-in", color: "yellow" },
          ...(isAdmin ? [{ key: "inactive", label: "Inactive", color: "gray" }] : []),
        ].map(({ key, label, color }) => {
          const active = statusFilters.has(key);
          const count = statusCounts[key] || 0;
          const colors = {
            green: active
              ? "bg-green-100 text-green-800 border-green-400 dark:bg-green-900/30 dark:text-green-400 dark:border-green-600"
              : "bg-gray-100 text-gray-400 border-gray-300 dark:bg-gray-800 dark:text-gray-500 dark:border-gray-600",
            yellow: active
              ? "bg-yellow-100 text-yellow-800 border-yellow-400 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-600"
              : "bg-gray-100 text-gray-400 border-gray-300 dark:bg-gray-800 dark:text-gray-500 dark:border-gray-600",
            gray: active
              ? "bg-gray-200 text-gray-700 border-gray-400 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-500"
              : "bg-gray-100 text-gray-400 border-gray-300 dark:bg-gray-800 dark:text-gray-500 dark:border-gray-600",
          };
          return (
            <button
              key={key}
              onClick={() => toggleFilter(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${colors[color]}`}
            >
              {active && <span>&#10003;</span>}
              {label}
              <span className="opacity-70">({count})</span>
            </button>
          );
        })}
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
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                Paste CSV data below (one player per line). Only <strong>Name</strong> and <strong>Email</strong> are required:
              </p>
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-2 mb-2 text-xs font-mono text-gray-600 dark:text-gray-400 space-y-0.5">
                <p className="font-semibold text-gray-500 dark:text-gray-300">Name, Email, Wins, Losses, Height(in), Age</p>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
                Email must be unique. Missing fields use defaults: 0W/0L, 5'10", age 30. Players get a random avatar, password <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">Password123</code>, and Regular status.
              </p>
              <textarea
                rows={10}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 font-mono focus:ring-2 focus:ring-court-500 focus:border-court-500 dark:bg-gray-700 dark:text-gray-200"
                placeholder={`Bryan, bryan@email.com, 26, 14, 74, 28\nJulien, julien@email.com, 23, 12\nDenis, denis@email.com`}
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

      {/* Add Player Modal */}
      {showAddPlayer && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Add Player</h2>
              <button onClick={() => setShowAddPlayer(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-white text-2xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Full Name *</label>
                  <input type="text" value={addForm.full_name} onChange={(e) => setAddForm({ ...addForm, full_name: e.target.value })}
                    className="input w-full" placeholder="John Doe" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Email *</label>
                  <input type="email" value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                    className="input w-full" placeholder="john@example.com" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Phone</label>
                  <input type="tel" value={addForm.phone} onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                    className="input w-full" placeholder="Optional" />
                </div>
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Record</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Wins</label>
                    <input type="number" min="0" value={addForm.wins} onChange={(e) => setAddForm({ ...addForm, wins: parseInt(e.target.value) || 0 })}
                      className="input w-full" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Losses</label>
                    <input type="number" min="0" value={addForm.losses} onChange={(e) => setAddForm({ ...addForm, losses: parseInt(e.target.value) || 0 })}
                      className="input w-full" />
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Physical</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Height</label>
                    <div className="flex items-center gap-1">
                      <input type="number" min="4" max="7"
                        value={Math.floor(addForm.height_inches / 12)}
                        onChange={(e) => {
                          const ft = parseInt(e.target.value) || 5;
                          const inches = addForm.height_inches % 12;
                          setAddForm({ ...addForm, height_inches: ft * 12 + inches });
                        }}
                        className="input w-14 text-center" />
                      <span className="text-gray-400 text-sm">'</span>
                      <input type="number" min="0" max="11"
                        value={addForm.height_inches % 12}
                        onChange={(e) => {
                          const ft = Math.floor(addForm.height_inches / 12);
                          const inches = parseInt(e.target.value) || 0;
                          setAddForm({ ...addForm, height_inches: ft * 12 + inches });
                        }}
                        className="input w-14 text-center" />
                      <span className="text-gray-400 text-sm">"</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Age</label>
                    <input type="number" min="16" max="70" value={addForm.age}
                      onChange={(e) => setAddForm({ ...addForm, age: parseInt(e.target.value) || 30 })}
                      className="input w-full" />
                  </div>
                </div>
              </div>

              {customMetrics.length > 0 && (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Metrics (1-10)</p>
                  <div className="grid grid-cols-3 gap-3">
                    {customMetrics.map((metric) => (
                      <div key={metric.id}>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{metric.display_name}</label>
                        <input type="number" min={metric.min_value || 1} max={metric.max_value || 10} step="0.5"
                          value={addForm[`metric_${metric.id}`] || metric.default_value || 5}
                          onChange={(e) => setAddForm({ ...addForm, [`metric_${metric.id}`]: parseFloat(e.target.value) || 5 })}
                          className="input w-full" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-gray-400 dark:text-gray-500">
                Default password: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">Password123</code>
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowAddPlayer(false)} className="btn-secondary text-sm py-2 px-4">Cancel</button>
                <button onClick={handleAddPlayer} disabled={adding || !addForm.full_name.trim() || !addForm.email.trim()}
                  className={`font-medium py-2 px-6 rounded-lg text-sm transition-colors ${
                    adding || !addForm.full_name.trim() || !addForm.email.trim()
                      ? "bg-gray-200 dark:bg-gray-600 text-gray-400 cursor-not-allowed"
                      : "bg-green-600 hover:bg-green-700 text-white"
                  }`}>
                  {adding ? "Adding..." : "Add Player"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 dark:text-gray-400">Loading players...</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedPlayers.map((player, idx) => {
            const pMetrics = playerMetricsMap[player.id] || [];
            const height = formatHeight(player.height_inches);
            const winPct = ((player.win_rate || 0.5) * 100).toFixed(0);
            const gamesWon = player.games_won || 0;
            const gamesLost = (player.games_played || 0) - gamesWon;

            return (
              <div key={player.id} className="rounded-xl bg-gradient-to-b from-amber-300 via-yellow-400 to-amber-500 p-[2px] shadow-lg hover:shadow-xl transition-shadow">
                <div className="rounded-[10px] bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 overflow-hidden">

                  {/* Card body — clickable */}
                  <Link to={`/players/${player.id}`} className="block px-4 pt-3 pb-2">
                    <div className="flex items-center gap-3">
                      {/* Rank badge */}
                      {isRanked && (
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                          idx === 0 ? "bg-yellow-400 text-yellow-900" :
                          idx === 1 ? "bg-gray-300 text-gray-700" :
                          idx === 2 ? "bg-orange-300 text-orange-800" :
                          "bg-gray-700 text-gray-400"
                        }`}>
                          {idx + 1}
                        </div>
                      )}

                      {/* Avatar with rating overlay */}
                      <div className="relative shrink-0">
                        {player.avatar_url ? (
                          <AvatarBadge avatarId={player.avatar_url} size="md" />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-court-500 to-arcade-500 flex items-center justify-center text-white font-bold text-lg">
                            {player.full_name.charAt(0)}
                          </div>
                        )}
                        {player.player_rating && (
                          <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-gradient-to-br from-court-500 to-court-600 border-2 border-gray-950 flex items-center justify-center">
                            <span className="font-retro text-[7px] text-white">{player.player_rating}</span>
                          </div>
                        )}
                      </div>

                      {/* Name & info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-retro text-[8px] text-white truncate leading-tight">
                          {player.full_name.toUpperCase()}
                        </h3>
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-500">
                          <span className={`badge-${player.player_status}`}>{player.player_status}</span>
                          {height && <span>{height}</span>}
                          {player.age && <span>Age {player.age}</span>}
                        </div>
                      </div>
                    </div>

                    {/* Awards row */}
                    {(player.mvp_count > 0 || player.xfactor_count > 0 || player.shaqtin_count > 0) && (
                      <div className="flex items-center gap-3 mt-2 text-[10px]">
                        {player.mvp_count > 0 && <span className="text-yellow-500 font-bold">{"\uD83C\uDFC6"}{player.mvp_count}</span>}
                        {player.xfactor_count > 0 && <span className="text-blue-400 font-bold">{"\u26A1"}{player.xfactor_count}</span>}
                        {player.shaqtin_count > 0 && <span className="text-purple-400 font-bold">{"\uD83E\uDD26"}{player.shaqtin_count}</span>}
                      </div>
                    )}
                  </Link>

                  {/* Stats strip */}
                  <div className="bg-gray-800/50 border-t border-gray-700/50 px-4 py-2">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="font-retro text-[9px] text-court-400">{winPct}%</div>
                        <div className="text-[7px] text-gray-500 uppercase tracking-wider">Win</div>
                      </div>
                      <div>
                        <div className="font-retro text-[9px] text-white">{gamesWon}-{gamesLost}</div>
                        <div className="text-[7px] text-gray-500 uppercase tracking-wider">W-L</div>
                      </div>
                      <div>
                        <div className="font-retro text-[9px] text-white">{player.games_played || 0}</div>
                        <div className="text-[7px] text-gray-500 uppercase tracking-wider">GP</div>
                      </div>
                    </div>
                  </div>

                  {/* Admin controls — below stats strip */}
                  {isAdmin && (
                    <div className="border-t border-gray-700/50 px-4 py-2 flex items-center justify-between">
                      <select
                        value={player.player_status}
                        onChange={async (e) => {
                          const newStatus = e.target.value;
                          const labels = { regular: "Regular", dropin: "Drop-in", inactive: "Inactive" };
                          setPlayers((prev) => prev.map((p) =>
                            p.id === player.id ? { ...p, player_status: newStatus } : p
                          ));
                          try {
                            await updatePlayerAdmin(runId, player.id, { player_status: newStatus });
                            toast.success(`${player.full_name} → ${labels[newStatus]}`);
                          } catch {
                            setPlayers((prev) => prev.map((p) =>
                              p.id === player.id ? { ...p, player_status: player.player_status } : p
                            ));
                            toast.error("Update failed");
                          }
                        }}
                        className="text-[10px] font-semibold border border-gray-700 rounded px-1.5 py-0.5 bg-gray-800 text-gray-300"
                      >
                        <option value="regular">Regular</option>
                        <option value="dropin">Drop-in</option>
                        <option value="inactive">Inactive</option>
                      </select>
                      {pMetrics.length > 0 && (
                        <div className="flex items-center gap-2">
                          {pMetrics.map((m) => (
                            <div key={m.metric_id} className="text-center">
                              <input
                                type="number" step="0.5" min={m.min_value || 1} max={m.max_value || 10}
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
                                className="w-10 text-[10px] font-bold text-court-400 text-center bg-transparent border border-gray-700 rounded px-1 py-0.5 focus:border-court-500 focus:outline-none"
                              />
                              <div className="text-[6px] text-gray-600 truncate max-w-[40px]" title={m.display_name}>
                                {m.display_name}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
