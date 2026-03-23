/**
 * Voting API Functions
 * ====================
 * MVP and Shaqtin' a Fool voting endpoints.
 */

import api from "./client";

export const castVote = (gameId, data) =>
  api.post(`/games/${gameId}/votes`, data);

export const getMyVotes = (gameId) =>
  api.get(`/games/${gameId}/votes/mine`);

export const getGameAwards = (gameId) =>
  api.get(`/games/${gameId}/awards`);
