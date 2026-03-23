import api from "./client";

export const getWeights = (runId) => api.get(`/runs/${runId}/algorithm/weights`);
export const updateWeights = (runId, weights) =>
  api.put(`/runs/${runId}/algorithm/weights`, { weights });

export const listCustomMetrics = (runId) => api.get(`/runs/${runId}/algorithm/metrics`);
export const createCustomMetric = (runId, data) =>
  api.post(`/runs/${runId}/algorithm/metrics`, data);
export const updateCustomMetric = (runId, id, data) =>
  api.patch(`/runs/${runId}/algorithm/metrics/${id}`, data);
export const deleteCustomMetric = (runId, id) =>
  api.delete(`/runs/${runId}/algorithm/metrics/${id}`);

export const getPlayerMetrics = (runId, userId) =>
  api.get(`/runs/${runId}/algorithm/players/${userId}/metrics`);
export const updatePlayerMetrics = (runId, userId, metrics) =>
  api.put(`/runs/${runId}/algorithm/players/${userId}/metrics`, metrics);
