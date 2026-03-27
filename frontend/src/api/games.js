import api from "./client";

export const listGames = (runId, status) =>
  api.get(`/runs/${runId}/games`, { params: status ? { status_filter: status } : {} });

export const getGame = (runId, id) => api.get(`/runs/${runId}/games/${id}`);
export const createGame = (runId, data) => api.post(`/runs/${runId}/games`, data);
export const updateGame = (runId, id, data) => api.patch(`/runs/${runId}/games/${id}`, data);

export const rsvpToGame = (runId, gameId, status) =>
  api.post(`/runs/${runId}/games/${gameId}/rsvp`, { status });
export const getGameRsvps = (runId, gameId) => api.get(`/runs/${runId}/games/${gameId}/rsvps`);
export const adminRsvp = (runId, gameId, userId, status) =>
  api.post(`/runs/${runId}/games/${gameId}/rsvp/admin`, { user_id: userId, status });
export const pokePlayers = (runId, gameId, userIds = null) =>
  api.post(`/runs/${runId}/games/${gameId}/poke`, userIds ? { user_ids: userIds } : {});

export const generateTeams = (runId, gameId) => api.post(`/runs/${runId}/games/${gameId}/teams`);
export const getTeams = (runId, gameId) => api.get(`/runs/${runId}/games/${gameId}/teams`);

// Team editing (post-generation, pre-result)
export const moveTeamAssignment = (runId, gameId, assignmentId, team) =>
  api.patch(`/runs/${runId}/games/${gameId}/teams/${assignmentId}`, { team });
export const removeTeamAssignment = (runId, gameId, assignmentId) =>
  api.delete(`/runs/${runId}/games/${gameId}/teams/${assignmentId}`);
export const addTeamAssignment = (runId, gameId, userId, team) =>
  api.post(`/runs/${runId}/games/${gameId}/teams/add`, { user_id: userId, team });

export const recordResult = (runId, gameId, data) =>
  api.post(`/runs/${runId}/games/${gameId}/result`, data);

export const cancelGame = (runId, gameId) => api.post(`/runs/${runId}/games/${gameId}/cancel`);
export const skipGame = (runId, gameId, notes) =>
  api.post(`/runs/${runId}/games/${gameId}/skip`, null, { params: notes ? { notes } : {} });
export const deleteGame = (runId, gameId) => api.delete(`/runs/${runId}/games/${gameId}`);
export const generateSeasonGames = (runId) => api.post(`/runs/${runId}/games/generate-season`);
