/**
 * Algorithm Configuration API
 * ===========================
 * Endpoints for managing team balancing weights and custom metrics.
 */

import api from "./client";

// --- Weights ---
export const getWeights = () => api.get("/admin/algorithm/weights");
export const updateWeights = (weights) =>
  api.put("/admin/algorithm/weights", { weights });

// --- Custom Metrics ---
export const listCustomMetrics = () => api.get("/admin/algorithm/metrics");
export const createCustomMetric = (data) =>
  api.post("/admin/algorithm/metrics", data);
export const updateCustomMetric = (id, data) =>
  api.patch(`/admin/algorithm/metrics/${id}`, data);
export const deleteCustomMetric = (id) =>
  api.delete(`/admin/algorithm/metrics/${id}`);

// --- Player Custom Metric Values ---
export const getPlayerMetrics = (userId) =>
  api.get(`/admin/algorithm/players/${userId}/metrics`);
export const updatePlayerMetrics = (userId, metrics) =>
  api.put(`/admin/algorithm/players/${userId}/metrics`, metrics);
