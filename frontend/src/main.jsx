/**
 * Application Entry Point
 * =======================
 * TEACHING NOTE:
 *   This is where React mounts into the DOM. We wrap the app in:
 *   - BrowserRouter: enables client-side routing (URL changes without page reload)
 *   - Toaster: provides toast notifications anywhere in the app
 */

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import App from "./App";
import useThemeStore from "./stores/themeStore";
import "./index.css";

// Apply theme before first render to prevent flash of wrong theme
useThemeStore.getState().initTheme();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster position="top-right" />
    </BrowserRouter>
  </React.StrictMode>
);
