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
import { Link } from "react-router-dom";
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
  quickAddPlayer,
} from "../api/admin";
import { createGame, generateSeasonGames, listGames, updateGame, cancelGame } from "../api/games";
import {
  updateRun,
  listRunsNeedingPlayers,
  suggestPlayer,
  listSuggestions,
  handleSuggestion,
  listRunMembers,
} from "../api/runs";
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
  jordan_factor: "Win Rate",
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
  const [showCreateGame, setShowCreateGame] = useState(false);
  const [newGame, setNewGame] = useState({ title: "", game_date: "", game_time: currentRun?.default_game_time || "", location: currentRun?.default_location || "TBD", num_teams: 2 });

  // Games tab state
  const [adminGames, setAdminGames] = useState([]);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [editingGameId, setEditingGameId] = useState(null);
  const [editGameForm, setEditGameForm] = useState({});

  // Suggestions state
  const [suggestions, setSuggestions] = useState([]);
  const [runsNeedingPlayers, setRunsNeedingPlayers] = useState([]);
  const [myRunMembers, setMyRunMembers] = useState([]);
  const [suggestForm, setSuggestForm] = useState({ targetRunId: "", userId: "", message: "" });

  // Import state
  const [importText, setImportText] = useState("");
  const [importResult, setImportResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // Admin players table state
  const [adminStatusFilters, setAdminStatusFilters] = useState(new Set(["regular", "dropin", "inactive"]));
  const [adminSort, setAdminSort] = useState({ key: "full_name", dir: "asc" });

  // Quick Add Player state
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [addForm, setAddForm] = useState({
    full_name: "", email: "", phone: "", wins: 0, losses: 0,
    height_inches: 70, age: 30, mobility: 3.0, avg_offense: 3.0, avg_defense: 3.0, avg_overall: 3.0,
  });
  const [adding, setAdding] = useState(false);

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

  const fetchAdminGames = async () => {
    if (!runId) return;
    setGamesLoading(true);
    try {
      const { data } = await listGames(runId);
      setAdminGames(data.sort((a, b) => new Date(a.game_date) - new Date(b.game_date)));
    } catch { setAdminGames([]); }
    finally { setGamesLoading(false); }
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
    if (tab === "games" && runId) {
      fetchAdminGames();
    }
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
        skill_level: currentRun.skill_level ?? 5,
        needs_players: currentRun.needs_players ?? false,
        start_date: currentRun.start_date || "",
        end_date: currentRun.end_date || "",
        dropin_open_hours_before: currentRun.dropin_open_hours_before ?? 12,
        dropin_priority_mode: currentRun.dropin_priority_mode || "fifo",
      });
    }
    if (tab === "suggestions" && runId) {
      listSuggestions(runId).then(({ data }) => setSuggestions(data)).catch(() => {});
      listRunsNeedingPlayers().then(({ data }) => setRunsNeedingPlayers(data)).catch(() => {});
      listRunMembers(runId).then(({ data }) => setMyRunMembers(data)).catch(() => {});
    }
  }, [tab, currentRun, runId]);

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
      payload.skill_level = parseInt(payload.skill_level);
      // Convert empty date strings to null
      if (!payload.start_date) payload.start_date = null;
      if (!payload.end_date) payload.end_date = null;
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

  const handleCreateGame = async (e) => {
    e.preventDefault();
    if (!newGame.title.trim() || !newGame.game_date) {
      toast.error("Title and date are required");
      return;
    }
    try {
      const gameDate = newGame.game_time
        ? new Date(`${newGame.game_date}T${newGame.game_time}`)
        : new Date(newGame.game_date);
      await createGame(runId, {
        title: newGame.title.trim(),
        game_date: gameDate.toISOString(),
        location: newGame.location || "TBD",
        num_teams: parseInt(newGame.num_teams) || 2,
      });
      toast.success("Game created! Players have been notified.");
      setShowCreateGame(false);
      setNewGame({ title: "", game_date: "", game_time: currentRun?.default_game_time || "", location: currentRun?.default_location || "TBD", num_teams: 2 });
      fetchAdminGames();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create game");
    }
  };

  const handleGenerateSeasonGames = async () => {
    if (!confirm("Generate all games for the season based on the run schedule? This won't create duplicates.")) return;
    try {
      const { data } = await generateSeasonGames(runId);
      toast.success(`Created ${data.games_created} games for ${data.total_weeks} weeks!`);
      fetchAdminGames();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to generate games");
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

  const handleQuickAddPlayer = async (e) => {
    if (e) e.preventDefault();
    if (!addForm.full_name.trim() || !addForm.email.trim()) {
      toast.error("Name and email are required");
      return;
    }
    setAdding(true);
    try {
      await quickAddPlayer(runId, addForm);
      toast.success(`Player "${addForm.full_name}" added!`);
      setAddForm({
        full_name: "", email: "", phone: "", wins: 0, losses: 0,
        height_inches: 70, age: 30, mobility: 3.0, avg_offense: 3.0, avg_defense: 3.0, avg_overall: 3.0,
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

  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);

  const DAY_NAMES_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const hasFullSchedule = currentRun?.default_game_time && currentRun?.start_date && currentRun?.end_date && (currentRun?.default_game_day !== null && currentRun?.default_game_day !== undefined);

  const STATUS_LABELS = {
    scheduled: "Scheduled", invites_sent: "Invites Sent", dropin_open: "Drop-in Open",
    teams_set: "Teams Set", completed: "Completed", cancelled: "Cancelled", skipped: "Skipped",
  };
  const STATUS_COLORS = {
    scheduled: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
    invites_sent: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    dropin_open: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    teams_set: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    completed: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
    cancelled: "bg-red-200 text-red-900 dark:bg-red-900/40 dark:text-red-300 font-bold",
  };

  const tabs = ["pending", "players", "games", "balancer", "settings"];
  const tabLabels = { settings: "Run Settings" };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Admin Panel</h1>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors capitalize ${
              tab === t
                ? "border-court-500 text-court-600"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            {tabLabels[t] || t} {t === "pending" && pending.length > 0 && `(${pending.length})`}
          </button>
        ))}
      </div>

      {loading && tab !== "balancer" ? (
        <p className="text-gray-500 dark:text-gray-400">Loading...</p>
      ) : tab === "pending" ? (
        /* ===== Pending Registrations ===== */
        pending.length === 0 ? (
          <div className="card text-center py-8">
            <p className="text-gray-500 dark:text-gray-400">No pending registrations.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pending.map((user) => (
              <div key={user.id} className="card flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">{user.full_name}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
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
      ) : tab === "games" ? (
        /* ===== Games Tab ===== */
        <div className="space-y-4">
          {/* One-Off Game Creation */}
          <div className="flex items-center gap-3">
            <button onClick={() => setShowCreateGame(!showCreateGame)} className="btn-primary">
              {showCreateGame ? "Cancel" : "+ One-Off Game"}
            </button>
          </div>

          {showCreateGame && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <p className="text-sm text-amber-800 dark:text-amber-300 mb-3">
                This creates a game outside the regular schedule. All regular and drop-in members will be notified.
              </p>
              <form onSubmit={handleCreateGame} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Title *</label>
                  <input type="text" required value={newGame.title} onChange={(e) => setNewGame({ ...newGame, title: e.target.value })}
                    placeholder="e.g. Special Pickup - Apr 5" className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-md px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Date *</label>
                  <input type="date" required value={newGame.game_date} onChange={(e) => setNewGame({ ...newGame, game_date: e.target.value })}
                    className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-md px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Time</label>
                  <input type="time" value={newGame.game_time} onChange={(e) => setNewGame({ ...newGame, game_time: e.target.value })}
                    className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-md px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Location</label>
                  <input type="text" value={newGame.location} onChange={(e) => setNewGame({ ...newGame, location: e.target.value })}
                    placeholder="TBD" className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-md px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Teams</label>
                  <select value={newGame.num_teams} onChange={(e) => setNewGame({ ...newGame, num_teams: Number(e.target.value) })}
                    className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-md px-3 py-2 text-sm">
                    {[2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div className="flex items-end">
                  <button type="submit" className="btn-primary w-full">Create Game</button>
                </div>
              </form>
            </div>
          )}

          {/* Games Table */}
          {gamesLoading ? (
            <p className="text-gray-500 dark:text-gray-400">Loading games...</p>
          ) : adminGames.length === 0 ? (
            <div className="card text-center py-8">
              <p className="text-gray-500 dark:text-gray-400">No games yet. Generate season games from Run Settings or create a one-off game above.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Date</th>
                    <th className="py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Title</th>
                    <th className="py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Location</th>
                    <th className="py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Status</th>
                    <th className="py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">RSVPs</th>
                    <th className="py-3 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {adminGames.map((game) => {
                    const isEditing = editingGameId === game.id;
                    const d = new Date(game.game_date);
                    const canEdit = !["completed", "cancelled", "skipped"].includes(game.status);

                    return (
                      <tr key={game.id} className={`border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 ${game.status === "cancelled" ? "opacity-60 bg-red-50 dark:bg-red-900/10" : ""}`}>
                        <td className="py-2 px-3 text-sm">
                          {isEditing ? (
                            <div className="flex gap-1">
                              <input type="date" value={editGameForm.game_date || ""} onChange={(e) => setEditGameForm({ ...editGameForm, game_date: e.target.value })}
                                className="w-32 text-xs border rounded px-1 py-1 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600" />
                              <input type="time" value={editGameForm.game_time || ""} onChange={(e) => setEditGameForm({ ...editGameForm, game_time: e.target.value })}
                                className="w-24 text-xs border rounded px-1 py-1 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600" />
                            </div>
                          ) : (
                            <span className="text-gray-700 dark:text-gray-300">
                              {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                              <span className="text-gray-400 dark:text-gray-500 ml-1 text-xs">
                                {d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                              </span>
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-sm">
                          {isEditing ? (
                            <input type="text" value={editGameForm.title || ""} onChange={(e) => setEditGameForm({ ...editGameForm, title: e.target.value })}
                              className="w-full text-sm border rounded px-2 py-1 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600" />
                          ) : (
                            <span className={`font-medium text-gray-900 dark:text-gray-100 ${game.status === "cancelled" ? "line-through text-red-600 dark:text-red-400" : ""}`}>{game.title}</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-sm">
                          {isEditing ? (
                            <input type="text" value={editGameForm.location || ""} onChange={(e) => setEditGameForm({ ...editGameForm, location: e.target.value })}
                              className="w-full text-sm border rounded px-2 py-1 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600" />
                          ) : (
                            <span className="text-gray-600 dark:text-gray-400">{game.location}</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[game.status] || ""}`}>
                            {STATUS_LABELS[game.status] || game.status}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-sm text-gray-600 dark:text-gray-400">
                          {game.accepted_count || 0}/{game.roster_size}
                        </td>
                        <td className="py-2 px-3">
                          {isEditing ? (
                            <div className="flex gap-1">
                              <button
                                onClick={async () => {
                                  try {
                                    const payload = { title: editGameForm.title, location: editGameForm.location };
                                    if (editGameForm.game_date) {
                                      const dt = editGameForm.game_time
                                        ? new Date(`${editGameForm.game_date}T${editGameForm.game_time}`)
                                        : new Date(editGameForm.game_date);
                                      payload.game_date = dt.toISOString();
                                    }
                                    await updateGame(runId, game.id, payload);
                                    toast.success("Game updated");
                                    setEditingGameId(null);
                                    fetchAdminGames();
                                  } catch { toast.error("Update failed"); }
                                }}
                                className="text-xs bg-green-500 hover:bg-green-600 text-white px-2 py-1 rounded"
                              >Save</button>
                              <button onClick={() => setEditingGameId(null)} className="text-xs bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 px-2 py-1 rounded">Cancel</button>
                            </div>
                          ) : canEdit ? (
                            <div className="flex gap-1">
                              <button
                                onClick={() => {
                                  const gd = new Date(game.game_date);
                                  setEditingGameId(game.id);
                                  setEditGameForm({
                                    title: game.title,
                                    location: game.location,
                                    game_date: gd.toISOString().split("T")[0],
                                    game_time: gd.toTimeString().slice(0, 5),
                                  });
                                }}
                                className="text-xs text-court-600 hover:text-court-800 font-medium"
                              >Edit</button>
                              <button
                                onClick={async () => {
                                  if (!confirm(`Cancel "${game.title}"? Players will see this game as cancelled.`)) return;
                                  try { await cancelGame(runId, game.id); toast.success("Game cancelled"); fetchAdminGames(); }
                                  catch { toast.error("Failed"); }
                                }}
                                className="text-xs text-red-600 hover:text-red-800 font-medium"
                              >Cancel</button>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : tab === "players" ? (
        /* ===== All Players ===== */
        <div className="space-y-4">
          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => setShowAddPlayer(!showAddPlayer)}
              className="bg-court-500 hover:bg-court-600 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
            >
              {showAddPlayer ? "Cancel" : "+ Add Player"}
            </button>
            <button
              onClick={() => { setShowImportModal(true); setImportResult(null); }}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
            >
              Import Players
            </button>
          </div>
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
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Height (in)</label>
                        <input type="number" min="48" max="96" value={addForm.height_inches || 70}
                          onChange={(e) => setAddForm({ ...addForm, height_inches: parseInt(e.target.value) || 70 })}
                          className="input w-full" />
                        <span className="text-[10px] text-gray-400">{addForm.height_inches ? `${Math.floor(addForm.height_inches/12)}'${addForm.height_inches%12}"` : `5'10"`}</span>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Age</label>
                        <input type="number" min="16" max="70" value={addForm.age || 30}
                          onChange={(e) => setAddForm({ ...addForm, age: parseInt(e.target.value) || 30 })}
                          className="input w-full" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Mobility</label>
                        <input type="number" min="1" max="5" step="0.5" value={addForm.mobility || 3.0}
                          onChange={(e) => setAddForm({ ...addForm, mobility: parseFloat(e.target.value) || 3.0 })}
                          className="input w-full" />
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Ratings</p>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Offense</label>
                        <input type="number" min="1" max="5" step="0.5" value={addForm.avg_offense || 3.0}
                          onChange={(e) => setAddForm({ ...addForm, avg_offense: parseFloat(e.target.value) || 3.0 })}
                          className="input w-full" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Defense</label>
                        <input type="number" min="1" max="5" step="0.5" value={addForm.avg_defense || 3.0}
                          onChange={(e) => setAddForm({ ...addForm, avg_defense: parseFloat(e.target.value) || 3.0 })}
                          className="input w-full" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Overall</label>
                        <input type="number" min="1" max="5" step="0.5" value={addForm.avg_overall || 3.0}
                          onChange={(e) => setAddForm({ ...addForm, avg_overall: parseFloat(e.target.value) || 3.0 })}
                          className="input w-full" />
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Default password: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">Password123</code>
                  </p>
                  <div className="flex justify-end gap-2 pt-2">
                    <button onClick={() => setShowAddPlayer(false)} className="btn-secondary text-sm py-2 px-4">Cancel</button>
                    <button
                      onClick={handleQuickAddPlayer}
                      disabled={adding || !addForm.full_name.trim() || !addForm.email.trim()}
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

          {/* Status Filter Chips */}
          <div className="flex items-center gap-2 mb-4">
            {[
              { key: "regular", label: "Regular", color: "green" },
              { key: "dropin", label: "Drop-in", color: "yellow" },
              { key: "inactive", label: "Inactive", color: "gray" },
            ].map(({ key, label, color }) => {
              const active = adminStatusFilters.has(key);
              const count = players.filter((p) => p.player_status === key).length;
              const colorMap = {
                green: active ? "bg-green-100 text-green-800 border-green-400 dark:bg-green-900/30 dark:text-green-400 dark:border-green-600" : "bg-gray-100 text-gray-400 border-gray-300 dark:bg-gray-800 dark:text-gray-500 dark:border-gray-600",
                yellow: active ? "bg-yellow-100 text-yellow-800 border-yellow-400 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-600" : "bg-gray-100 text-gray-400 border-gray-300 dark:bg-gray-800 dark:text-gray-500 dark:border-gray-600",
                gray: active ? "bg-gray-200 text-gray-700 border-gray-400 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-500" : "bg-gray-100 text-gray-400 border-gray-300 dark:bg-gray-800 dark:text-gray-500 dark:border-gray-600",
              };
              return (
                <button key={key} onClick={() => setAdminStatusFilters((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; })}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${colorMap[color]}`}>
                  {active && <span>&#10003;</span>} {label} <span className="opacity-70">({count})</span>
                </button>
              );
            })}
          </div>

          {/* Players Table */}
          {(() => {
            const filtered = players.filter((p) => adminStatusFilters.has(p.player_status));
            const sorted = [...filtered].sort((a, b) => {
              const { key, dir } = adminSort;
              let av = a[key], bv = b[key];
              if (typeof av === "string") return dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
              av = av ?? 0; bv = bv ?? 0;
              return dir === "asc" ? av - bv : bv - av;
            });
            const SortTh = ({ field, children }) => {
              const active = adminSort.key === field;
              return (
                <th className="py-3 px-2 text-xs font-medium text-gray-500 dark:text-gray-400 cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200 whitespace-nowrap"
                  onClick={() => setAdminSort((prev) => prev.key === field ? { key: field, dir: prev.dir === "asc" ? "desc" : "asc" } : { key: field, dir: "desc" })}>
                  {children} {active ? (adminSort.dir === "asc" ? "▲" : "▼") : ""}
                </th>
              );
            };
            const inputCls = "w-14 text-sm border rounded px-1 py-1 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 text-center";
            return (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <SortTh field="full_name">Player</SortTh>
                      <SortTh field="player_status">Status</SortTh>
                      {currentRun?.dropin_priority_mode === "admin" && <SortTh field="dropin_priority">Wait List Order</SortTh>}
                      <SortTh field="height_inches">Ht</SortTh>
                      <SortTh field="age">Age</SortTh>
                      <SortTh field="mobility">Mob</SortTh>
                      <SortTh field="avg_offense">OFF</SortTh>
                      <SortTh field="avg_defense">DEF</SortTh>
                      <SortTh field="avg_overall">OVR</SortTh>
                      <SortTh field="games_played">GP</SortTh>
                      <SortTh field="games_won">W</SortTh>
                      {isSuperAdmin && <SortTh field="role">Role</SortTh>}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((player) => (
                      <tr key={player.id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-1">
                            <input type="text" defaultValue={player.full_name}
                              onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== player.full_name) handleUpdatePlayer(player.id, "full_name", v); }}
                              className="w-24 text-sm font-medium border border-transparent hover:border-gray-300 dark:hover:border-gray-600 rounded px-1 py-1 bg-transparent dark:text-gray-200 focus:border-gray-300 dark:focus:border-gray-600" />
                            <Link to={`/players/${player.id}`} className="text-court-500 hover:text-court-600 text-xs shrink-0" title="View profile">
                              &rarr;
                            </Link>
                          </div>
                          <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-[140px]">{player.email}</div>
                        </td>
                        <td className="py-2 px-2">
                          <select value={player.player_status} onChange={(e) => handleUpdatePlayer(player.id, "player_status", e.target.value)}
                            className="text-xs border rounded px-1 py-1 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600">
                            <option value="regular">Regular</option>
                            <option value="dropin">Drop-in</option>
                            <option value="inactive">Inactive</option>
                          </select>
                        </td>
                        {currentRun?.dropin_priority_mode === "admin" && (
                          <td className="py-2 px-2">
                            {player.player_status === "dropin" ? (
                              <input type="number" min="1" defaultValue={player.dropin_priority || ""}
                                placeholder="#"
                                onBlur={(e) => {
                                  const v = parseInt(e.target.value);
                                  if (!isNaN(v)) handleUpdatePlayer(player.id, "dropin_priority", v);
                                }}
                                className={inputCls} />
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                        )}
                        <td className="py-2 px-2">
                          <input type="number" defaultValue={player.height_inches || ""} placeholder="in"
                            onBlur={(e) => e.target.value && handleUpdatePlayer(player.id, "height_inches", parseInt(e.target.value))}
                            className={inputCls} />
                        </td>
                        <td className="py-2 px-2">
                          <input type="number" defaultValue={player.age || ""} placeholder="yrs"
                            onBlur={(e) => e.target.value && handleUpdatePlayer(player.id, "age", parseInt(e.target.value))}
                            className={inputCls} />
                        </td>
                        <td className="py-2 px-2">
                          <input type="number" min="1" max="5" step="0.5" defaultValue={player.mobility || ""} placeholder="1-5"
                            onBlur={(e) => e.target.value && handleUpdatePlayer(player.id, "mobility", parseFloat(e.target.value))}
                            className={inputCls} />
                        </td>
                        <td className="py-2 px-2">
                          <input type="number" min="1" max="5" step="0.5" defaultValue={player.avg_offense?.toFixed(1) || ""} placeholder="1-5"
                            onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) handleUpdatePlayer(player.id, "avg_offense", v); }}
                            className={inputCls} />
                        </td>
                        <td className="py-2 px-2">
                          <input type="number" min="1" max="5" step="0.5" defaultValue={player.avg_defense?.toFixed(1) || ""} placeholder="1-5"
                            onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) handleUpdatePlayer(player.id, "avg_defense", v); }}
                            className={inputCls} />
                        </td>
                        <td className="py-2 px-2">
                          <input type="number" min="1" max="5" step="0.5" defaultValue={player.avg_overall?.toFixed(1) || ""} placeholder="1-5"
                            onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) handleUpdatePlayer(player.id, "avg_overall", v); }}
                            className={inputCls} />
                        </td>
                        <td className="py-2 px-2">
                          <input type="number" min="0" defaultValue={player.games_played ?? ""}
                            onBlur={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) handleUpdatePlayer(player.id, "games_played", v); }}
                            className={inputCls} />
                        </td>
                        <td className="py-2 px-2">
                          <input type="number" min="0" defaultValue={player.games_won ?? ""}
                            onBlur={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) handleUpdatePlayer(player.id, "games_won", v); }}
                            className={inputCls} />
                        </td>
                        {isSuperAdmin && (
                          <td className="py-2 px-2">
                            <select value={player.role} onChange={(e) => handleUpdatePlayer(player.id, "role", e.target.value)}
                              className="text-xs border rounded px-1 py-1 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600">
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
            );
          })()}

          {/* Suggestions Section */}
          {suggestions.length > 0 && (
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Incoming Suggestions ({suggestions.length})
              </h2>
              <div className="space-y-3">
                {suggestions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">
                        {s.suggested_user?.full_name || `User #${s.suggested_user_id}`}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Suggested by {s.suggested_by?.full_name || `User #${s.suggested_by_user_id}`}
                      </p>
                      {s.message && <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 italic">"{s.message}"</p>}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          try {
                            await handleSuggestion(runId, s.id, { status: "accepted" });
                            toast.success(`${s.suggested_user?.full_name} added as drop-in!`);
                            setSuggestions((prev) => prev.filter((x) => x.id !== s.id));
                          } catch (err) {
                            toast.error(err.response?.data?.detail || "Failed");
                          }
                        }}
                        className="bg-green-500 hover:bg-green-600 text-white text-sm font-medium py-1.5 px-3 rounded-lg"
                      >
                        Accept
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            await handleSuggestion(runId, s.id, { status: "declined" });
                            toast.success("Suggestion declined");
                            setSuggestions((prev) => prev.filter((x) => x.id !== s.id));
                          } catch (err) {
                            toast.error(err.response?.data?.detail || "Failed");
                          }
                        }}
                        className="bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-300 text-sm font-medium py-1.5 px-3 rounded-lg"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Suggest a Player to Another Run */}
          {runsNeedingPlayers.filter((r) => r.id !== runId).length > 0 && (
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Suggest a Player to Another Run</h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target Run</label>
                  <select
                    value={suggestForm.targetRunId}
                    onChange={(e) => setSuggestForm({ ...suggestForm, targetRunId: e.target.value })}
                    className="input"
                  >
                    <option value="">Select a run...</option>
                    {runsNeedingPlayers
                      .filter((r) => r.id !== runId)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} (Skill: {r.skill_level}/5)
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Player to Suggest</label>
                  <select
                    value={suggestForm.userId}
                    onChange={(e) => setSuggestForm({ ...suggestForm, userId: e.target.value })}
                    className="input"
                  >
                    <option value="">Select a player...</option>
                    {myRunMembers.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.user?.full_name || `User #${m.user_id}`} ({m.player_status})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Note (optional)</label>
                  <input
                    type="text"
                    value={suggestForm.message}
                    onChange={(e) => setSuggestForm({ ...suggestForm, message: e.target.value })}
                    className="input"
                    placeholder="e.g. Great shooter, competitive player"
                  />
                </div>
                <button
                  onClick={async () => {
                    if (!suggestForm.targetRunId || !suggestForm.userId) {
                      toast.error("Select both a run and a player");
                      return;
                    }
                    try {
                      await suggestPlayer(parseInt(suggestForm.targetRunId), {
                        suggested_user_id: parseInt(suggestForm.userId),
                        message: suggestForm.message || null,
                      });
                      toast.success("Player suggested!");
                      setSuggestForm({ targetRunId: "", userId: "", message: "" });
                    } catch (err) {
                      toast.error(err.response?.data?.detail || "Failed to suggest player");
                    }
                  }}
                  className="btn-primary"
                >
                  Suggest Player
                </button>
              </div>
            </div>
          )}

          {/* Import Modal */}
          {showImportModal && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-gray-800 rounded-xl max-w-lg w-full shadow-2xl">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Import Players</h2>
                  <button onClick={() => setShowImportModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-white text-2xl leading-none">&times;</button>
                </div>
                <div className="px-6 py-4">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Paste player data below (one per line):</p>
                  <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-2 mb-3 text-xs font-mono text-gray-600 dark:text-gray-400 space-y-0.5">
                    <p>Name, Email, Wins, Losses</p>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
                    Email is required and must be unique. Default password: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">Password123</code>
                  </p>
                  <textarea
                    rows={10}
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 font-mono focus:ring-2 focus:ring-court-500 focus:border-court-500 dark:bg-gray-700 dark:text-gray-200"
                    placeholder={`Bryan, bryan@email.com, 26, 14\nJulien, julien@email.com, 23, 12`}
                  />
                  <div className="flex items-center justify-between mt-4">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {parseImportText(importText).length} player(s) detected
                    </span>
                    <button
                      onClick={async () => {
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
                      }}
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
        </div>
      ) : tab === "settings" ? (
        /* ===== Run Settings Tab ===== */
        <div className="card max-w-2xl">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Run Settings</h2>
          {runForm && (
            <form onSubmit={handleSaveRunSettings} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Run Name</label>
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={runForm.description}
                  onChange={(e) => setRunForm({ ...runForm, description: e.target.value })}
                  className="input"
                  placeholder="Brief description of this run"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Default Location</label>
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Game Day</label>
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Game Time</label>
                  <input
                    type="time"
                    value={runForm.default_game_time}
                    onChange={(e) => setRunForm({ ...runForm, default_game_time: e.target.value })}
                    className="input"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Season Start Date</label>
                  <input
                    type="date"
                    value={runForm.start_date || ""}
                    onChange={(e) => setRunForm({ ...runForm, start_date: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Season End Date</label>
                  <input
                    type="date"
                    value={runForm.end_date || ""}
                    onChange={(e) => setRunForm({ ...runForm, end_date: e.target.value })}
                    className="input"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Roster Size</label>
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Teams</label>
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Dues ($)</label>
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Skill Level</label>
                  <select
                    value={runForm.skill_level}
                    onChange={(e) => setRunForm({ ...runForm, skill_level: e.target.value })}
                    className="input"
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>{n} — {["Beginner", "Casual", "Intermediate", "Competitive", "Elite"][n - 1]}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 pb-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={runForm.needs_players}
                      onChange={(e) => setRunForm({ ...runForm, needs_players: e.target.checked })}
                      className="w-4 h-4 text-court-500 rounded focus:ring-court-500"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">This run needs players</span>
                  </label>
                </div>
              </div>
              {/* Drop-in Settings */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Drop-in Settings</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Open drop-in spots
                    </label>
                    <select
                      value={runForm.dropin_open_hours_before ?? "never"}
                      onChange={(e) => setRunForm({
                        ...runForm,
                        dropin_open_hours_before: e.target.value === "never" ? null : parseInt(e.target.value),
                      })}
                      className="input"
                    >
                      <option value="never">Never (manual only)</option>
                      <option value="1">1 hour before game</option>
                      <option value="2">2 hours before game</option>
                      <option value="4">4 hours before game</option>
                      <option value="8">8 hours before game</option>
                      <option value="12">12 hours before game</option>
                      <option value="24">24 hours before game</option>
                      <option value="48">48 hours before game</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Waitlist priority
                    </label>
                    <select
                      value={runForm.dropin_priority_mode || "fifo"}
                      onChange={(e) => setRunForm({ ...runForm, dropin_priority_mode: e.target.value })}
                      className="input"
                    >
                      <option value="fifo">First come, first served</option>
                      <option value="admin">Admin-defined order</option>
                    </select>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {runForm.dropin_priority_mode === "admin"
                        ? "Set priority order on each drop-in player's profile"
                        : "Earliest RSVP gets the first open spot"}
                    </p>
                  </div>
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

          {/* Season Schedule Section */}
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide mb-3">Season Schedule</h3>
            {hasFullSchedule ? (
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  Every <strong>{DAY_NAMES[currentRun.default_game_day]}</strong> at <strong>{currentRun.default_game_time}</strong>,
                  from <strong>{new Date(currentRun.start_date + "T00:00").toLocaleDateString()}</strong> to <strong>{new Date(currentRun.end_date + "T00:00").toLocaleDateString()}</strong>
                </p>
                <button
                  onClick={handleGenerateSeasonGames}
                  className="bg-court-600 hover:bg-court-700 text-white font-semibold py-2 px-4 rounded-lg"
                >
                  Generate Season Games
                </button>
              </div>
            ) : (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Fill in Game Day, Game Time, Season Start Date, and Season End Date above, then save to enable season generation.
              </p>
            )}
          </div>
        </div>
      ) : (
        /* ===== Balancer Tab ===== */
        <div className="space-y-8">
          {/* Weight Sliders */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Algorithm Weights</h2>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  Total: {totalWeight.toFixed(2)} (auto-normalized)
                </span>
                <button
                  onClick={handleSaveWeights}
                  disabled={!weightsDirty || savingWeights}
                  className={`text-sm font-medium py-1.5 px-4 rounded-lg transition-colors ${
                    weightsDirty
                      ? "bg-court-500 hover:bg-court-600 text-white"
                      : "bg-gray-200 dark:bg-gray-600 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                  }`}
                >
                  {savingWeights ? "Saving..." : "Save Weights"}
                </button>
              </div>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
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
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
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
                      <span className="text-sm font-mono text-gray-600 dark:text-gray-400">
                        {w.weight.toFixed(2)}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">({pct}%)</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {weights.length === 0 && (
              <p className="text-gray-400 dark:text-gray-500 text-sm">Loading weights...</p>
            )}
          </div>

          {/* Custom Metrics Management */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Custom Metrics</h2>
              <button
                onClick={() => setShowNewMetricForm(!showNewMetricForm)}
                className="text-sm font-medium text-court-600 hover:text-court-700"
              >
                {showNewMetricForm ? "Cancel" : "+ Add Metric"}
              </button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Create custom player attributes that feed into team balancing.
              New metrics start with weight 0 — adjust the slider above to activate them.
            </p>

            {/* New metric form */}
            {showNewMetricForm && (
              <form onSubmit={handleCreateMetric} className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 mb-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Internal Name (lowercase, no spaces)
                    </label>
                    <input
                      type="text"
                      required
                      pattern="^[a-z][a-z0-9_]*$"
                      value={newMetric.name}
                      onChange={(e) => setNewMetric({ ...newMetric, name: e.target.value })}
                      className="w-full text-sm border rounded px-3 py-1.5 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600"
                      placeholder="e.g. shooting"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Display Name
                    </label>
                    <input
                      type="text"
                      required
                      value={newMetric.display_name}
                      onChange={(e) => setNewMetric({ ...newMetric, display_name: e.target.value })}
                      className="w-full text-sm border rounded px-3 py-1.5 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600"
                      placeholder="e.g. Shooting Ability"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Description (optional)
                  </label>
                  <input
                    type="text"
                    value={newMetric.description}
                    onChange={(e) => setNewMetric({ ...newMetric, description: e.target.value })}
                    className="w-full text-sm border rounded px-3 py-1.5 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600"
                    placeholder="What this metric measures"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Min Value</label>
                    <input
                      type="number"
                      step="any"
                      value={newMetric.min_value}
                      onChange={(e) => setNewMetric({ ...newMetric, min_value: parseFloat(e.target.value) })}
                      className="w-full text-sm border rounded px-3 py-1.5 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Max Value</label>
                    <input
                      type="number"
                      step="any"
                      value={newMetric.max_value}
                      onChange={(e) => setNewMetric({ ...newMetric, max_value: parseFloat(e.target.value) })}
                      className="w-full text-sm border rounded px-3 py-1.5 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Default</label>
                    <input
                      type="number"
                      step="any"
                      value={newMetric.default_value}
                      onChange={(e) => setNewMetric({ ...newMetric, default_value: parseFloat(e.target.value) })}
                      className="w-full text-sm border rounded px-3 py-1.5 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600"
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
              <p className="text-sm text-gray-400 dark:text-gray-500">No custom metrics yet.</p>
            ) : (
              <div className="space-y-2">
                {customMetrics.map((metric) => (
                  <div
                    key={metric.id}
                    className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
                  >
                    <div>
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                        {metric.display_name}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">
                        ({metric.name}) &middot; {metric.min_value}–{metric.max_value}, default {metric.default_value}
                      </span>
                      {metric.description && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">{metric.description}</p>
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
