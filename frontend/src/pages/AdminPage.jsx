/**
 * Admin Page
 * ==========
 * Admin dashboard for managing registrations, players, games,
 * and the team balancing algorithm configuration.
 *
 * TEACHING NOTE:
 *   The "Balancer" tab lets admins adjust how the team balancing
 *   algorithm weights different player attributes. Each weight has
 *   a slider (0-1.00) and the system normalizes them at runtime,
 *   so admins think in relative terms ("offense should matter twice
 *   as much as height") rather than exact percentages.
 *
 *   Admins can also create custom metrics (e.g., "shooting", "hustle")
 *   which automatically get a weight slider set to 0 until the admin
 *   decides how much it should matter.
 */

import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import useAuthStore from "../stores/authStore";
import useRunStore from "../stores/runStore";
import {
  listPendingRegistrations,
  approveRegistration,
  denyRegistration,
  listAllPlayers,
  updatePlayerAdmin,
  importPlayers,
} from "../api/admin";
import { createGame } from "../api/games";
import { updateRun } from "../api/runs";
import {
  getWeights,
  updateWeights,
  listCustomMetrics,
  createCustomMetric,
  deleteCustomMetric,
} from "../api/algorithm";

// Human-friendly labels for built-in metrics
const BUILTIN_LABELS = {
  overall: "Overall Rating",
  jordan_factor: "Jordan Factor",
  offense: "Offense Rating",
  defense: "Defense Rating",
  height: "Height",
  age: "Age",
  mobility: "Mobility",
};

export default function AdminPage() {
  const user = useAuthStore((s) => s.user);
  const { currentRun, setCurrentRun } = useRunStore();
  const runId = currentRun?.id;
  const isSuperAdmin = user?.role === "super_admin";

  const [tab, setTab] = useState("pending");

  // Run settings state
  const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const [runForm, setRunForm] = useState(null);
  const [savingRun, setSavingRun] = useState(false);
  const [pending, setPending] = useState([]);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Balancer state
  const [weights, setWeights] = useState([]);
  const [weightsDirty, setWeightsDirty] = useState(false);
  const [savingWeights, setSavingWeights] = useState(false);
  const [customMetrics, setCustomMetrics] = useState([]);
  const [newMetric, setNewMetric] = useState({
    name: "",
    display_name: "",
    description: "",
    min_value: 1,
    max_value: 5,
    default_value: 3,
  });
  const [showNewMetricForm, setShowNewMetricForm] = useState(false);
  const [newGameTeams, setNewGameTeams] = useState(2);

  // Import state
  const [importText, setImportText] = useState("");
  const [importResult, setImportResult] = useState(null);
  const [importing, setImporting] = useState(false);

  const fetchPending = async () => {
    if (!runId) return;
    try {
      const { data } = await listPendingRegistrations(runId);
      setPending(data.users);
    } catch { /* empty */ }
  };

  const fetchPlayers = async () => {
    if (!runId) return;
    try {
      const { data } = await listAllPlayers(runId);
      setPlayers(data.users);
    } catch { /* empty */ }
  };

  const fetchWeights = async () => {
    try {
      const { data } = await getWeights(runId);
      setWeights(data.weights);
      setWeightsDirty(false);
    } catch { /* empty */ }
  };

  const fetchCustomMetrics = async () => {
    try {
      const { data } = await listCustomMetrics(runId);
      setCustomMetrics(data);
    } catch { /* empty */ }
  };

  useEffect(() => {
    if (runId) {
      Promise.all([fetchPending(), fetchPlayers()]).then(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [runId]);

  // Load balancer data when tab is selected
  useEffect(() => {
    if (tab === "balancer") {
      fetchWeights();
      fetchCustomMetrics();
    }
    if (tab === "settings" && currentRun) {
      setRunForm({
        name: currentRun.name || "",
        description: currentRun.description || "",
        default_location: currentRun.default_location || "TBD",
        default_game_day: currentRun.default_game_day ?? 2,
        default_game_time: currentRun.default_game_time || "19:00",
        default_roster_size: currentRun.default_roster_size || 16,
        default_num_teams: currentRun.default_num_teams || 2,
        dues_amount: currentRun.dues_amount ?? "",
      });
    }
  }, [tab, currentRun]);

  const handleSaveRunSettings = async (e) => {
    e.preventDefault();
    setSavingRun(true);
    try {
      const payload = { ...runForm };
      // Convert empty dues to null
      if (payload.dues_amount === "" || payload.dues_amount === null) {
        payload.dues_amount = null;
      } else {
        payload.dues_amount = parseFloat(payload.dues_amount);
      }
      payload.default_game_day = parseInt(payload.default_game_day);
      payload.default_roster_size = parseInt(payload.default_roster_size);
      payload.default_num_teams = parseInt(payload.default_num_teams);
      const { data } = await updateRun(runId, payload);
      setCurrentRun(data);
      toast.success("Run settings saved!");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save settings");
    } finally {
      setSavingRun(false);
    }
  };

  const handleApprove = async (userId, status) => {
    try {
      await approveRegistration(runId, userId, status);
      toast.success(`Player approved as ${status}`);
      fetchPending();
      fetchPlayers();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Approval failed");
    }
  };

  const handleDeny = async (userId) => {
    if (!confirm("Deny this registration? The user will be notified and their account deactivated.")) return;
    try {
      await denyRegistration(runId, userId);
      toast.success("Registration denied");
      fetchPending();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed");
    }
  };

  const handleUpdatePlayer = async (userId, field, value) => {
    // Confirm status changes since they affect what games a player is invited to
    if (field === "player_status") {
      const labels = { regular: "Regular", dropin: "Drop-in", inactive: "Inactive" };
      if (!confirm(`Change this player's status to ${labels[value] || value}? They will be notified.`)) return;
    }
    try {
      await updatePlayerAdmin(runId, userId, { [field]: value });
      toast.success("Player updated");
      fetchPlayers();
    } catch {
      toast.error("Update failed");
    }
  };

  const handleCreateGame = async () => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    date.setHours(19, 0, 0, 0);
    try {
      await createGame(runId, {
        title: `Weekly Pickup - ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
        game_date: date.toISOString(),
        location: "TBD",
        num_teams: newGameTeams,
      });
      toast.success("Game created!");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create game");
    }
  };

  // --- Balancer handlers ---

  const handleWeightChange = (metricName, newWeight) => {
    setWeights((prev) =>
      prev.map((w) =>
        w.metric_name === metricName ? { ...w, weight: newWeight } : w
      )
    );
    setWeightsDirty(true);
  };

  const handleSaveWeights = async () => {
    setSavingWeights(true);
    try {
      const { data } = await updateWeights(runId, weights);
      setWeights(data.weights);
      setWeightsDirty(false);
      toast.success("Weights saved");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save weights");
    } finally {
      setSavingWeights(false);
    }
  };

  const handleCreateMetric = async (e) => {
    e.preventDefault();
    try {
      await createCustomMetric(runId, newMetric);
      toast.success(`Metric "${newMetric.display_name}" created`);
      setNewMetric({ name: "", display_name: "", description: "", min_value: 1, max_value: 5, default_value: 3 });
      setShowNewMetricForm(false);
      fetchWeights();
      fetchCustomMetrics();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create metric");
    }
  };

  const handleDeleteMetric = async (metric) => {
    if (!confirm(`Delete metric "${metric.display_name}"? This removes all player values for it.`)) return;
    try {
      await deleteCustomMetric(runId, metric.id);
      toast.success("Metric deleted");
      fetchWeights();
      fetchCustomMetrics();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to delete metric");
    }
  };

  // --- Import handler ---

  const parseImportText = (text) => {
    const lines = text.trim().split("\n").filter((l) => l.trim());
    const players = [];
    for (const line of lines) {
      // Support tab-separated or comma-separated: "Name\tWins\tLosses" or "Name,Wins,Losses"
      const parts = line.includes("\t") ? line.split("\t") : line.split(",");
      const name = parts[0]?.trim();
      if (!name) continue;
      const wins = parseInt(parts[1]?.trim()) || 0;
      const losses = parseInt(parts[2]?.trim()) || 0;
      players.push({ name, wins, losses });
    }
    return players;
  };

  const handleImport = async () => {
    const players = parseImportText(importText);
    if (players.length === 0) {
      toast.error("No valid player data found. Use format: Name, Wins, Losses (one per line)");
      return;
    }
    if (!confirm(`Import ${players.length} player(s) with default password "Password123"?`)) return;

    setImporting(true);
    setImportResult(null);
    try {
      const { data } = await importPlayers(runId, { players });
      setImportResult(data);
      toast.success(`Imported ${data.created_count} player(s)`);
      if (data.created_count > 0) {
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
        <p className="text-gray-500">Please select a Run from the dropdown above.</p>
      </div>
    );
  }

  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);

  const tabs = ["pending", "players", "import", "balancer", "settings"];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-600 flex items-center gap-1">
            Teams:
            <select
              value={newGameTeams}
              onChange={(e) => setNewGameTeams(Number(e.target.value))}
              className="border border-gray-300 rounded px-2 py-1 text-sm"
            >
              {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <button onClick={handleCreateGame} className="btn-primary">
            + Create Game
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors capitalize ${
              tab === t
                ? "border-court-500 text-court-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t} {t === "pending" && pending.length > 0 && `(${pending.length})`}
          </button>
        ))}
      </div>

      {loading && tab !== "balancer" ? (
        <p className="text-gray-500">Loading...</p>
      ) : tab === "pending" ? (
        /* ===== Pending Registrations ===== */
        pending.length === 0 ? (
          <div className="card text-center py-8">
            <p className="text-gray-500">No pending registrations.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pending.map((user) => (
              <div key={user.id} className="card flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">{user.full_name}</h3>
                  <p className="text-sm text-gray-500">{user.email}</p>
                  <p className="text-xs text-gray-400">
                    Registered {new Date(user.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApprove(user.id, "regular")}
                    className="bg-green-500 hover:bg-green-600 text-white text-sm font-medium py-1.5 px-3 rounded-lg"
                  >
                    Regular
                  </button>
                  <button
                    onClick={() => handleApprove(user.id, "dropin")}
                    className="bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-medium py-1.5 px-3 rounded-lg"
                  >
                    Drop-in
                  </button>
                  <button
                    onClick={() => handleDeny(user.id)}
                    className="btn-danger text-sm py-1.5 px-3"
                  >
                    Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : tab === "import" ? (
        /* ===== Import Players ===== */
        <div className="space-y-6">
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Import Players</h2>
            <p className="text-sm text-gray-500 mb-4">
              Paste player data below (one player per line). Accepted formats:
            </p>
            <div className="bg-gray-50 rounded-lg p-3 mb-4 text-xs font-mono text-gray-600 space-y-1">
              <p>Name, Wins, Losses</p>
              <p>Name{"\t"}Wins{"\t"}Losses</p>
            </div>
            <p className="text-xs text-gray-400 mb-4">
              Imported players get a random NBA legend avatar (changeable later), default password <code className="bg-gray-100 px-1 rounded">Password123</code>, and status set to Regular.
            </p>
            <textarea
              rows={12}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 font-mono focus:ring-2 focus:ring-court-500 focus:border-court-500"
              placeholder={`Bryan, 26, 14\nJulien, 23, 12\nDenis, 23, 17\n...`}
            />
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-gray-500">
                {parseImportText(importText).length} player(s) detected
              </span>
              <button
                onClick={handleImport}
                disabled={importing || !importText.trim()}
                className={`font-medium py-2 px-6 rounded-lg transition-colors ${
                  importing || !importText.trim()
                    ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                    : "bg-court-500 hover:bg-court-600 text-white"
                }`}
              >
                {importing ? "Importing..." : "Import Players"}
              </button>
            </div>
          </div>

          {/* Import Results */}
          {importResult && (
            <div className="card">
              <h3 className="font-semibold text-gray-900 mb-3">Import Results</h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-green-700">{importResult.created_count}</div>
                  <div className="text-xs text-green-600 font-medium">Created</div>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-yellow-700">{importResult.skipped_count}</div>
                  <div className="text-xs text-yellow-600 font-medium">Skipped</div>
                </div>
              </div>
              {importResult.created_players.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-medium text-green-700 mb-1">Created:</p>
                  <p className="text-sm text-gray-600">{importResult.created_players.join(", ")}</p>
                </div>
              )}
              {importResult.skipped_players.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-yellow-700 mb-1">Skipped (already exist):</p>
                  <p className="text-sm text-gray-600">{importResult.skipped_players.join(", ")}</p>
                </div>
              )}
            </div>
          )}
        </div>
      ) : tab === "players" ? (
        /* ===== All Players ===== */
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="py-3 px-4 text-sm font-medium text-gray-500">Player</th>
                <th className="py-3 px-4 text-sm font-medium text-gray-500">Status</th>
                <th className="py-3 px-4 text-sm font-medium text-gray-500">Height</th>
                <th className="py-3 px-4 text-sm font-medium text-gray-500">Age</th>
                <th className="py-3 px-4 text-sm font-medium text-gray-500">Mobility</th>
                {isSuperAdmin && (
                  <th className="py-3 px-4 text-sm font-medium text-gray-500">Role</th>
                )}
              </tr>
            </thead>
            <tbody>
              {players.map((player) => (
                <tr key={player.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <div>
                      <p className="font-medium">{player.full_name}</p>
                      <p className="text-xs text-gray-500">{player.email}</p>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <select
                      value={player.player_status}
                      onChange={(e) => handleUpdatePlayer(player.id, "player_status", e.target.value)}
                      className="text-sm border rounded px-2 py-1"
                    >
                      <option value="regular">Regular</option>
                      <option value="dropin">Drop-in</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </td>
                  <td className="py-3 px-4">
                    <input
                      type="number"
                      defaultValue={player.height_inches || ""}
                      onBlur={(e) => e.target.value && handleUpdatePlayer(player.id, "height_inches", parseInt(e.target.value))}
                      className="w-16 text-sm border rounded px-2 py-1"
                      placeholder="in"
                    />
                  </td>
                  <td className="py-3 px-4">
                    <input
                      type="number"
                      defaultValue={player.age || ""}
                      onBlur={(e) => e.target.value && handleUpdatePlayer(player.id, "age", parseInt(e.target.value))}
                      className="w-16 text-sm border rounded px-2 py-1"
                      placeholder="yrs"
                    />
                  </td>
                  <td className="py-3 px-4">
                    <input
                      type="number"
                      min="1"
                      max="5"
                      step="0.5"
                      defaultValue={player.mobility || ""}
                      onBlur={(e) => e.target.value && handleUpdatePlayer(player.id, "mobility", parseFloat(e.target.value))}
                      className="w-16 text-sm border rounded px-2 py-1"
                      placeholder="1-5"
                    />
                  </td>
                  {isSuperAdmin && (
                    <td className="py-3 px-4">
                      <select
                        value={player.role}
                        onChange={(e) => handleUpdatePlayer(player.id, "role", e.target.value)}
                        className="text-sm border rounded px-2 py-1"
                      >
                        <option value="player">Player</option>
                        <option value="admin">Admin</option>
                        <option value="super_admin">Super Admin</option>
                      </select>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : tab === "settings" ? (
        /* ===== Run Settings Tab ===== */
        <div className="card max-w-2xl">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Run Settings</h2>
          {runForm && (
            <form onSubmit={handleSaveRunSettings} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Run Name</label>
                <input
                  type="text"
                  required
                  value={runForm.name}
                  onChange={(e) => setRunForm({ ...runForm, name: e.target.value })}
                  className="input"
                  placeholder="e.g. Monday Madness"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={runForm.description}
                  onChange={(e) => setRunForm({ ...runForm, description: e.target.value })}
                  className="input"
                  placeholder="Brief description of this run"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Default Location</label>
                <input
                  type="text"
                  value={runForm.default_location}
                  onChange={(e) => setRunForm({ ...runForm, default_location: e.target.value })}
                  className="input"
                  placeholder="e.g. Rec Center Gym"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Game Day</label>
                  <select
                    value={runForm.default_game_day}
                    onChange={(e) => setRunForm({ ...runForm, default_game_day: e.target.value })}
                    className="input"
                  >
                    {DAY_NAMES.map((day, i) => (
                      <option key={i} value={i}>{day}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Game Time</label>
                  <input
                    type="time"
                    value={runForm.default_game_time}
                    onChange={(e) => setRunForm({ ...runForm, default_game_time: e.target.value })}
                    className="input"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Roster Size</label>
                  <input
                    type="number"
                    min="2"
                    max="30"
                    value={runForm.default_roster_size}
                    onChange={(e) => setRunForm({ ...runForm, default_roster_size: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Teams</label>
                  <input
                    type="number"
                    min="2"
                    max="8"
                    value={runForm.default_num_teams}
                    onChange={(e) => setRunForm({ ...runForm, default_num_teams: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dues ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={runForm.dues_amount}
                    onChange={(e) => setRunForm({ ...runForm, dues_amount: e.target.value })}
                    className="input"
                    placeholder="Optional"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={savingRun}
                className="btn-primary"
              >
                {savingRun ? "Saving..." : "Save Settings"}
              </button>
            </form>
          )}
        </div>
      ) : (
        /* ===== Balancer Tab ===== */
        <div className="space-y-8">
          {/* Weight Sliders */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Algorithm Weights</h2>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500">
                  Total: {totalWeight.toFixed(2)} (auto-normalized)
                </span>
                <button
                  onClick={handleSaveWeights}
                  disabled={!weightsDirty || savingWeights}
                  className={`text-sm font-medium py-1.5 px-4 rounded-lg transition-colors ${
                    weightsDirty
                      ? "bg-court-500 hover:bg-court-600 text-white"
                      : "bg-gray-200 text-gray-400 cursor-not-allowed"
                  }`}
                >
                  {savingWeights ? "Saving..." : "Save Weights"}
                </button>
              </div>
            </div>
            <p className="text-sm text-gray-500 mb-6">
              Adjust how much each factor matters when balancing teams.
              Weights are relative — the algorithm normalizes them automatically.
            </p>

            <div className="space-y-4">
              {weights.map((w) => {
                const label = w.is_builtin
                  ? BUILTIN_LABELS[w.metric_name] || w.metric_name
                  : customMetrics.find((cm) => cm.name === w.metric_name)?.display_name || w.metric_name;
                const pct = totalWeight > 0 ? ((w.weight / totalWeight) * 100).toFixed(0) : 0;

                return (
                  <div key={w.metric_name} className="flex items-center gap-4">
                    <div className="w-40 flex-shrink-0">
                      <span className="text-sm font-medium text-gray-700">{label}</span>
                      {!w.is_builtin && (
                        <span className="ml-1 text-xs text-court-500">custom</span>
                      )}
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={w.weight}
                      onChange={(e) => handleWeightChange(w.metric_name, parseFloat(e.target.value))}
                      className="flex-1 h-2 accent-court-500"
                    />
                    <div className="w-20 text-right">
                      <span className="text-sm font-mono text-gray-600">
                        {w.weight.toFixed(2)}
                      </span>
                      <span className="text-xs text-gray-400 ml-1">({pct}%)</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {weights.length === 0 && (
              <p className="text-gray-400 text-sm">Loading weights...</p>
            )}
          </div>

          {/* Custom Metrics Management */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Custom Metrics</h2>
              <button
                onClick={() => setShowNewMetricForm(!showNewMetricForm)}
                className="text-sm font-medium text-court-600 hover:text-court-700"
              >
                {showNewMetricForm ? "Cancel" : "+ Add Metric"}
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Create custom player attributes that feed into team balancing.
              New metrics start with weight 0 — adjust the slider above to activate them.
            </p>

            {/* New metric form */}
            {showNewMetricForm && (
              <form onSubmit={handleCreateMetric} className="bg-gray-50 rounded-lg p-4 mb-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Internal Name (lowercase, no spaces)
                    </label>
                    <input
                      type="text"
                      required
                      pattern="^[a-z][a-z0-9_]*$"
                      value={newMetric.name}
                      onChange={(e) => setNewMetric({ ...newMetric, name: e.target.value })}
                      className="w-full text-sm border rounded px-3 py-1.5"
                      placeholder="e.g. shooting"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Display Name
                    </label>
                    <input
                      type="text"
                      required
                      value={newMetric.display_name}
                      onChange={(e) => setNewMetric({ ...newMetric, display_name: e.target.value })}
                      className="w-full text-sm border rounded px-3 py-1.5"
                      placeholder="e.g. Shooting Ability"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Description (optional)
                  </label>
                  <input
                    type="text"
                    value={newMetric.description}
                    onChange={(e) => setNewMetric({ ...newMetric, description: e.target.value })}
                    className="w-full text-sm border rounded px-3 py-1.5"
                    placeholder="What this metric measures"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Min Value</label>
                    <input
                      type="number"
                      step="any"
                      value={newMetric.min_value}
                      onChange={(e) => setNewMetric({ ...newMetric, min_value: parseFloat(e.target.value) })}
                      className="w-full text-sm border rounded px-3 py-1.5"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Max Value</label>
                    <input
                      type="number"
                      step="any"
                      value={newMetric.max_value}
                      onChange={(e) => setNewMetric({ ...newMetric, max_value: parseFloat(e.target.value) })}
                      className="w-full text-sm border rounded px-3 py-1.5"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Default</label>
                    <input
                      type="number"
                      step="any"
                      value={newMetric.default_value}
                      onChange={(e) => setNewMetric({ ...newMetric, default_value: parseFloat(e.target.value) })}
                      className="w-full text-sm border rounded px-3 py-1.5"
                    />
                  </div>
                </div>
                <button type="submit" className="btn-primary text-sm py-1.5 px-4">
                  Create Metric
                </button>
              </form>
            )}

            {/* Existing custom metrics */}
            {customMetrics.length === 0 ? (
              <p className="text-sm text-gray-400">No custom metrics yet.</p>
            ) : (
              <div className="space-y-2">
                {customMetrics.map((metric) => (
                  <div
                    key={metric.id}
                    className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <span className="text-sm font-medium text-gray-800">
                        {metric.display_name}
                      </span>
                      <span className="text-xs text-gray-400 ml-2">
                        ({metric.name}) &middot; {metric.min_value}–{metric.max_value}, default {metric.default_value}
                      </span>
                      {metric.description && (
                        <p className="text-xs text-gray-500">{metric.description}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteMetric(metric)}
                      className="text-red-500 hover:text-red-700 text-xs font-medium"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
