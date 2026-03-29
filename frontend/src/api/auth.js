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
export const validateInviteCode = (code) => api.get(`/auth/validate-code?code=${code}`);
export const forgotPassword = (email) => api.post('/auth/forgot-password', { email });
export const resetPassword = (token, new_password) => api.post('/auth/reset-password', { token, new_password });
export const refreshToken = () => api.post("/auth/refresh");
export const adminResetPassword = (runId, userId) => api.post(`/runs/${runId}/admin/players/${userId}/reset-password`);
