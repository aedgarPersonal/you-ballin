/**
 * Admin API Functions
 * ===================
 */

import api from "./client";

export const listPendingRegistrations = () => api.get("/admin/pending");
export const approveRegistration = (userId, playerStatus = "regular") =>
  api.post(`/admin/approve/${userId}?player_status=${playerStatus}`);
export const denyRegistration = (userId) => api.post(`/admin/deny/${userId}`);
export const updatePlayerAdmin = (userId, data) =>
  api.patch(`/admin/players/${userId}`, data);
export const listAllPlayers = (params) =>
  api.get("/admin/players", { params });
