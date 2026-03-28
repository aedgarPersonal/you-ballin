import api from "./client";

export const getRunStats = (runId) => api.get(`/runs/${runId}/stats`);
export const getMyMatchups = (runId) => api.get(`/runs/${runId}/stats/my-matchups`);
export const getPlayerMatchups = (runId, playerId) => api.get(`/runs/${runId}/stats/player/${playerId}/matchups`);
export const getPlayerGameHistory = (runId, playerId) => api.get(`/runs/${runId}/stats/player/${playerId}/game-history`);
export const getPlayerForm = (runId, playerId) => api.get(`/runs/${runId}/stats/player/${playerId}/form`);
export const listSeasons = (runId) => api.get(`/runs/${runId}/stats/seasons`);
export const getSeasonDetail = (runId, seasonId) => api.get(`/runs/${runId}/stats/seasons/${seasonId}`);
