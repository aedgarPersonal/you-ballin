import api from "./client";

// Run-scoped player listing
export const listPlayers = (runId, params) => api.get(`/runs/${runId}/players`, { params });

// Global endpoints (no run needed)
export const getPlayer = (id, runId) => api.get(`/players/${id}`, { params: runId ? { run_id: runId } : {} });
export const getMyProfile = () => api.get("/players/me");
export const updateMyProfile = (data) => api.patch("/players/me", data);
