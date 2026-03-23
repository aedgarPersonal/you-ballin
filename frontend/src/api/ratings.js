/**
 * Ratings API Functions
 * =====================
 */

import api from "./client";

export const getPlayerRatingSummary = (playerId) =>
  api.get(`/ratings/player/${playerId}/summary`);

export const getMyRatingForPlayer = (playerId) =>
  api.get(`/ratings/player/${playerId}/mine`);

export const ratePlayer = (playerId, data) =>
  api.post(`/ratings/player/${playerId}`, data);
