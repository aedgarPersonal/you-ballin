/**
 * Auth Store (Zustand)
 * ====================
 * Global authentication state management.
 *
 * TEACHING NOTE:
 *   Zustand is a minimal state management library. Unlike Redux, there's
 *   no boilerplate - just a function that returns an object with state
 *   and actions. Components use the `useAuthStore` hook to access state
 *   and the store automatically triggers re-renders when state changes.
 *
 *   Auth state is persisted to localStorage so users stay logged in
 *   across page refreshes and browser sessions.
 */

import { create } from "zustand";
import { refreshToken as refreshTokenApi } from "../api/auth";

const useAuthStore = create((set, get) => ({
  // State
  user: JSON.parse(localStorage.getItem("user") || "null"),
  token: localStorage.getItem("token") || null,
  isAuthenticated: !!localStorage.getItem("token"),

  // Actions
  login: (token, user) => {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
    set({ token, user, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    set({ token: null, user: null, isAuthenticated: false });
  },

  updateUser: (userData) => {
    const updated = { ...JSON.parse(localStorage.getItem("user") || "{}"), ...userData };
    localStorage.setItem("user", JSON.stringify(updated));
    set({ user: updated });
  },

  /**
   * Silently refresh the token on app startup.
   * If the current token is still valid, the server issues a fresh one
   * with a full 30-day lifetime, keeping the user logged in indefinitely.
   * If the token has expired, the 401 interceptor handles logout.
   */
  refreshSession: async () => {
    if (!get().isAuthenticated) return;
    try {
      const { data } = await refreshTokenApi();
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("user", JSON.stringify(data.user));
      set({ token: data.access_token, user: data.user });
    } catch {
      // Token invalid/expired — the 401 interceptor will handle logout
    }
  },
}));

export default useAuthStore;
