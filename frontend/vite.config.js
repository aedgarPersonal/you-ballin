/**
 * Vite Configuration
 * ==================
 * TEACHING NOTE:
 *   Vite is a fast build tool for modern web projects. Key features:
 *   - Hot Module Replacement (HMR) for instant updates during development
 *   - ES modules in dev (no bundling = fast startup)
 *   - Rollup-based bundling for production
 *
 *   The proxy configuration below routes API calls from the React dev
 *   server (port 5173) to the FastAPI backend (port 8000), avoiding
 *   CORS issues during development.
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
