/**
 * API Client
 * ==========
 * Centralized Axios instance for all backend API calls.
 *
 * TEACHING NOTE:
 *   By creating a single Axios instance, we:
 *   1. Set the base URL once (no repeating "http://localhost:8000")
 *   2. Automatically attach the JWT token to every request
 *   3. Handle 401 errors globally (redirect to login)
 *
 *   Interceptors run on EVERY request/response, making them perfect
 *   for cross-cutting concerns like auth and error handling.
 */

import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor: attach JWT token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: handle auth errors globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid - clear auth and redirect
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;
