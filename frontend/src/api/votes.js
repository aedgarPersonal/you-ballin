import api from "./client";

export const castVote = (runId, gameId, data) =>
  api.post(`/runs/${runId}/games/${gameId}/votes`, data);

export const getMyVotes = (runId, gameId) =>
  api.get(`/runs/${runId}/games/${gameId}/votes/mine`);

export const getGameAwards = (runId, gameId) =>
  api.get(`/runs/${runId}/games/${gameId}/awards`);

export const getRecentAwards = (runId) =>
  api.get("/awards/recent", { params: runId ? { run_id: runId } : {} });
