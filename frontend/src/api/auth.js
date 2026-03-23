/**
 * Auth API Functions
 * ==================
 * Functions for registration, login, and authentication.
 */

import api from "./client";

export const registerUser = (data) => api.post("/auth/register", data);
export const loginUser = (data) => api.post("/auth/login", data);
export const requestMagicLink = (email) => api.post("/auth/magic-link", { email });
export const verifyMagicLink = (token) => api.get(`/auth/magic-link/verify?token=${token}`);
export const googleAuth = (credential) => api.post("/auth/google", { credential });
