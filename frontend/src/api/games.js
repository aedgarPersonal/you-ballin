import api from "./client";

export const listGames = (runId, status) =>
  api.get(`/runs/${runId}/games`, { params: status ? { status_filter: status } : {} });

export const getGame = (runId, id) => api.get(`/runs/${runId}/games/${id}`);
export const createGame = (runId, data) => api.post(`/runs/${runId}/games`, data);
export const updateGame = (runId, id, data) => api.patch(`/runs/${runId}/games/${id}`, data);

export const rsvpToGame = (runId, gameId, status) =>
  api.post(`/runs/${runId}/games/${gameId}/rsvp`, { status });
export const getGameRsvps = (runId, gameId) => api.get(`/runs/${runId}/games/${gameId}/rsvps`);

export const generateTeams = (runId, gameId) => api.post(`/runs/${runId}/games/${gameId}/teams`);
export const getTeams = (runId, gameId) => api.get(`/runs/${runId}/games/${gameId}/teams`);

export const recordResult = (runId, gameId, data) =>
  api.post(`/runs/${runId}/games/${gameId}/result`, data);

export const cancelGame = (runId, gameId) => api.post(`/runs/${runId}/games/${gameId}/cancel`);
export const skipGame = (runId, gameId, notes) =>
  api.post(`/runs/${runId}/games/${gameId}/skip`, null, { params: notes ? { notes } : {} });
export const deleteGame = (runId, gameId) => api.delete(`/runs/${runId}/games/${gameId}`);
export const generateSeasonGames = (runId) => api.post(`/runs/${runId}/games/generate-season`);
