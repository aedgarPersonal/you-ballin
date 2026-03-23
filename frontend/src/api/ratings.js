import api from "./client";

export const getPlayerRatingSummary = (runId, playerId) =>
  api.get(`/runs/${runId}/ratings/player/${playerId}/summary`);

export const getMyRatingForPlayer = (runId, playerId) =>
  api.get(`/runs/${runId}/ratings/player/${playerId}/mine`);

export const ratePlayer = (runId, playerId, data) =>
  api.post(`/runs/${runId}/ratings/player/${playerId}`, data);
