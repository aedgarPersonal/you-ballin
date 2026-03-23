/**
 * Games API Functions
 * ===================
 */

import api from "./client";

export const listGames = (status) =>
  api.get("/games", { params: status ? { status_filter: status } : {} });

export const getGame = (id) => api.get(`/games/${id}`);
export const createGame = (data) => api.post("/games", data);
export const updateGame = (id, data) => api.patch(`/games/${id}`, data);

// RSVPs
export const rsvpToGame = (gameId, status) =>
  api.post(`/games/${gameId}/rsvp`, { status });
export const getGameRsvps = (gameId) => api.get(`/games/${gameId}/rsvps`);

// Teams
export const generateTeams = (gameId) => api.post(`/games/${gameId}/teams`);
export const getTeams = (gameId) => api.get(`/games/${gameId}/teams`);

// Results
export const recordResult = (gameId, data) =>
  api.post(`/games/${gameId}/result`, data);

// Cancel
export const cancelGame = (gameId) => api.post(`/games/${gameId}/cancel`);

