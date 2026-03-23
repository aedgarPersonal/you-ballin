/**
 * Admin Page
 * ==========
 * Admin dashboard for managing registrations, players, and games.
 */

import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import {
  listPendingRegistrations,
  approveRegistration,
  denyRegistration,
  listAllPlayers,
  updatePlayerAdmin,
} from "../api/admin";
import { createGame } from "../api/games";

export default function AdminPage() {
  const [tab, setTab] = useState("pending");
  const [pending, setPending] = useState([]);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchPending = async () => {
    try {
      const { data } = await listPendingRegistrations();
      setPending(data.users);
    } catch { /* empty */ }
  };

  const fetchPlayers = async () => {
    try {
      const { data } = await listAllPlayers();
      setPlayers(data.users);
    } catch { /* empty */ }
  };

  useEffect(() => {
    Promise.all([fetchPending(), fetchPlayers()]).then(() => setLoading(false));
  }, []);

  const handleApprove = async (userId, status) => {
    try {
      await approveRegistration(userId, status);
      toast.success(`Player approved as ${status}`);
      fetchPending();
      fetchPlayers();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Approval failed");
    }
  };

  const handleDeny = async (userId) => {
    try {
      await denyRegistration(userId);
      toast.success("Registration denied");
      fetchPending();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed");
    }
  };

  const handleUpdatePlayer = async (userId, field, value) => {
    try {
      await updatePlayerAdmin(userId, { [field]: value });
      toast.success("Player updated");
      fetchPlayers();
    } catch (err) {
      toast.error("Update failed");
    }
  };

  const handleCreateGame = async () => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    date.setHours(19, 0, 0, 0);
    try {
      await createGame({
        title: `Weekly Pickup - ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
        game_date: date.toISOString(),
        location: "TBD",
      });
      toast.success("Game created!");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create game");
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
        <button onClick={handleCreateGame} className="btn-primary">
          + Create Game
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        {["pending", "players"].map((t) => (
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

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : tab === "pending" ? (
        /* Pending Registrations */
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
      ) : (
        /* All Players */
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="py-3 px-4 text-sm font-medium text-gray-500">Player</th>
                <th className="py-3 px-4 text-sm font-medium text-gray-500">Status</th>
                <th className="py-3 px-4 text-sm font-medium text-gray-500">Height</th>
                <th className="py-3 px-4 text-sm font-medium text-gray-500">Age</th>
                <th className="py-3 px-4 text-sm font-medium text-gray-500">Mobility</th>
                <th className="py-3 px-4 text-sm font-medium text-gray-500">Role</th>
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
                  <td className="py-3 px-4">
                    <select
                      value={player.role}
                      onChange={(e) => handleUpdatePlayer(player.id, "role", e.target.value)}
                      className="text-sm border rounded px-2 py-1"
                    >
                      <option value="player">Player</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
