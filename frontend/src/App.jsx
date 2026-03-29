/**
 * App Component - Root Router
 * ============================
 * TEACHING NOTE:
 *   This component defines all the routes (URL -> page mappings).
 *   React Router renders the matching page component based on the URL.
 *
 *   Protected routes check for authentication and redirect to login
 *   if the user isn't logged in. Admin routes additionally check
 *   for the admin role.
 */

import { Routes, Route, Navigate } from "react-router-dom";
import useAuthStore from "./stores/authStore";
import useRunStore from "./stores/runStore";

// Layout
import Navbar from "./components/layout/Navbar";
import PushPrompt from "./components/PushPrompt";
import { InstallBanner } from "./components/InstallPrompt";

// Pages
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import GamesPage from "./pages/GamesPage";
import GameDetailPage from "./pages/GameDetailPage";
import PlayersPage from "./pages/PlayersPage";
import PlayerProfilePage from "./pages/PlayerProfilePage";
import AdminPage from "./pages/AdminPage";
import NotificationsPage from "./pages/NotificationsPage";
import StatsPage from "./pages/StatsPage";
import GameActionPage from "./pages/GameActionPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";

function ProtectedRoute({ children }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? children : <Navigate to="/login" />;
}

function AdminRoute({ children }) {
  const user = useAuthStore((s) => s.user);
  const isRunAdmin = useRunStore((s) => s.isRunAdmin);
  if (!user) return <Navigate to="/login" />;
  // Allow super admins and run admins; API endpoints enforce fine-grained access
  if (user.role !== "super_admin" && !isRunAdmin) return <Navigate to="/" />;
  return children;
}

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {isAuthenticated && <Navbar />}
      {isAuthenticated && <PushPrompt />}
      {isAuthenticated && <InstallBanner />}
      <main className={isAuthenticated ? "pt-[68px]" : ""}>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/game/:token" element={<GameActionPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Protected routes */}
          <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/games" element={<ProtectedRoute><GamesPage /></ProtectedRoute>} />
          <Route path="/games/:id" element={<ProtectedRoute><GameDetailPage /></ProtectedRoute>} />
          <Route path="/players" element={<ProtectedRoute><PlayersPage /></ProtectedRoute>} />
          <Route path="/players/:id" element={<ProtectedRoute><PlayerProfilePage /></ProtectedRoute>} />
          <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
          <Route path="/stats" element={<ProtectedRoute><StatsPage /></ProtectedRoute>} />

          {/* Admin routes */}
          <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}
