import api from "./client";

// --- Super Admin (global) ---
export const listAllUsers = () => api.get("/admin/users");
export const updateUserAdmin = (userId, data) => api.patch(`/admin/users/${userId}`, data);
export const getSchedulerStatus = () => api.get("/admin/scheduler");
export const clearRunRsvps = (runId) => api.delete(`/admin/runs/${runId}/rsvps`);
export const clearRunTeams = (runId) => api.delete(`/admin/runs/${runId}/teams`);

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
export const deletePlayer = (runId, userId) =>
  api.delete(`/runs/${runId}/admin/players/${userId}`);

// --- Invite Codes ---
export const createInviteCode = (runId, data = {}) =>
  api.post(`/runs/${runId}/admin/invite-codes`, data);
export const listInviteCodes = (runId) =>
  api.get(`/runs/${runId}/admin/invite-codes`);
export const updateInviteCode = (runId, codeId, data) =>
  api.patch(`/runs/${runId}/admin/invite-codes/${codeId}`, data);
export const deleteInviteCode = (runId, codeId) =>
  api.delete(`/runs/${runId}/admin/invite-codes/${codeId}`);

// --- Season Management ---
export const resetSeason = (runId, label) =>
  api.post(`/runs/${runId}/admin/season-reset`, { label });
