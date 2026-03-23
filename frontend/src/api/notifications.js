/**
 * Notifications API Functions
 * ===========================
 */

import api from "./client";

export const listNotifications = (params) =>
  api.get("/notifications", { params });
export const markAsRead = (id) => api.post(`/notifications/${id}/read`);
export const markAllAsRead = () => api.post("/notifications/read-all");
