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
 *
 *   VitePWA adds Progressive Web App support:
 *   - Auto-generates a service worker via Workbox
 *   - Injects a web app manifest for "Add to Home Screen"
 *   - Caches static assets for offline access
 *   - Uses NetworkFirst for API calls (fresh data when online, cached when offline)
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.js",
      includeAssets: ["basketball.svg", "app-icon.svg"],
      manifest: {
        name: "Double Dribble - Pickup Basketball",
        short_name: "Double Dribble",
        description: "Manage your pickup basketball games",
        theme_color: "#f97316",
        background_color: "#0a0a1a",
        display: "standalone",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "app-icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,svg,woff2}"],
        globIgnores: ["**/logo.png"],
      },
    }),
  ],
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
