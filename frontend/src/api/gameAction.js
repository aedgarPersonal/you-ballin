import api from "./client";

export const getGameAction = (token) =>
  api.get("/game-action", { params: { token } });

export const rsvpViaToken = (token, status) =>
  api.post("/game-action/rsvp", { status }, { params: { token } });

export const voteViaToken = (token, data) =>
  api.post("/game-action/vote", data, { params: { token } });
