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
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster position="top-right" />
    </BrowserRouter>
  </React.StrictMode>
);
