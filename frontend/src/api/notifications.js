/**
 * Notifications API Functions
 * ===========================
 */

import api from "./client";

export const listNotifications = (params) =>
  api.get("/notifications", { params });
export const markAsRead = (id) => api.post(`/notifications/${id}/read`);
export const markAllAsRead = () => api.post("/notifications/read-all");

// Push notification subscription
export const getVapidKey = () => api.get("/push/vapid-key");
export const subscribePush = (data) => api.post("/push/subscribe", data);
export const unsubscribePush = (endpoint) => api.post("/push/unsubscribe", { endpoint });
