import api from "./client";

export const listRuns = () => api.get("/runs");
export const getRun = (runId) => api.get(`/runs/${runId}`);
export const createRun = (data) => api.post("/runs", data);
export const updateRun = (runId, data) => api.patch(`/runs/${runId}`, data);

export const listRunAdmins = (runId) => api.get(`/runs/${runId}/admins`);
export const addRunAdmin = (runId, userId) => api.post(`/runs/${runId}/admins`, { user_id: userId });
export const removeRunAdmin = (runId, userId) => api.delete(`/runs/${runId}/admins/${userId}`);

export const listRunMembers = (runId) => api.get(`/runs/${runId}/members`);
export const joinRun = (runId) => api.post(`/runs/${runId}/join`);
export const updateMembership = (runId, userId, data) => api.patch(`/runs/${runId}/members/${userId}`, data);

// Needs Players & Suggestions
export const listRunsNeedingPlayers = () => api.get("/runs/needs-players");
export const suggestPlayer = (runId, data) => api.post(`/runs/${runId}/suggestions`, data);
export const listSuggestions = (runId, status) =>
  api.get(`/runs/${runId}/suggestions`, { params: status ? { status_filter: status } : {} });
export const handleSuggestion = (runId, suggestionId, data) =>
  api.patch(`/runs/${runId}/suggestions/${suggestionId}`, data);
