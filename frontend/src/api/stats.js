import api from "./client";

export const getRunStats = (runId) => api.get(`/runs/${runId}/stats`);
