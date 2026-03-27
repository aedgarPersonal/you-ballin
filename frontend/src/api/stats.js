import api from "./client";

export const getRunStats = (runId) => api.get(`/runs/${runId}/stats`);
export const getMyMatchups = (runId) => api.get(`/runs/${runId}/stats/my-matchups`);
export const getPlayerMatchups = (runId, playerId) => api.get(`/runs/${runId}/stats/player/${playerId}/matchups`);
