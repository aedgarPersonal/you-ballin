import api from "./client";

// --- Super Admin (global) ---
export const listAllUsers = () => api.get("/admin/users");
export const updateUserAdmin = (userId, data) => api.patch(`/admin/users/${userId}`, data);

// --- Run Admin (run-scoped) ---
export const listPendingRegistrations = (runId) => api.get(`/runs/${runId}/admin/pending`);
export const approveRegistration = (runId, userId, playerStatus = "regular") =>
  api.post(`/runs/${runId}/admin/approve/${userId}?player_status=${playerStatus}`);
export const denyRegistration = (runId, userId) => api.post(`/runs/${runId}/admin/deny/${userId}`);
export const updatePlayerAdmin = (runId, userId, data) =>
  api.patch(`/runs/${runId}/admin/players/${userId}`, data);
export const listAllPlayers = (runId, params) =>
  api.get(`/runs/${runId}/admin/players`, { params });
export const importPlayers = (runId, data) =>
  api.post(`/runs/${runId}/admin/import-players`, data);
export const quickAddPlayer = (runId, data) =>
  api.post(`/runs/${runId}/admin/add-player`, data);
