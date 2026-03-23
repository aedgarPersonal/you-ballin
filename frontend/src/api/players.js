/**
 * Players API Functions
 * =====================
 */

import api from "./client";

export const listPlayers = (params) => api.get("/players", { params });
export const getPlayer = (id) => api.get(`/players/${id}`);
export const getMyProfile = () => api.get("/players/me");
export const updateMyProfile = (data) => api.patch("/players/me", data);
