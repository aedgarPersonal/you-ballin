/**
 * Navigation Bar
 * ==============
 * Top navigation with links, run switcher, notifications badge, and user menu.
 * Includes a mobile hamburger menu with admin access and run management.
 */

import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import useAuthStore from "../../stores/authStore";
import useNotificationStore from "../../stores/notificationStore";
import useRunStore from "../../stores/runStore";
import useThemeStore from "../../stores/themeStore";
import { createRun } from "../../api/runs";
import { AvatarBadge } from "../AvatarPicker";

export default function Navbar() {
  const { user, logout } = useAuthStore();
  const { unreadCount, fetchNotifications } = useNotificationStore();
  const { runs, currentRun, setCurrentRun, fetchRuns, isRunAdmin } = useRunStore();
  const navigate = useNavigate();
  const [showCreateRun, setShowCreateRun] = useState(false);
  const [newRunName, setNewRunName] = useState("");
  const [creating, setCreating] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { theme, setTheme } = useThemeStore();

  const isSuperAdmin = user?.role === "super_admin";
  const canAccessAdmin = isSuperAdmin || isRunAdmin;

  const handleCreateRun = async (e) => {
    e.preventDefault();
    if (!newRunName.trim()) return;
    setCreating(true);
    try {
      const { data } = await createRun({ name: newRunName.trim() });
      await fetchRuns();
      setCurrentRun(data);
      setShowCreateRun(false);
      setNewRunName("");
    } catch (err) {
      console.error("Failed to create run:", err);
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    fetchRuns();
    // Poll for new notifications every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications, fetchRuns]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <nav className="fixed top-0 left-0 right-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Nav Links */}
          <div className="flex items-center space-x-8">
            <Link to="/" className="flex items-center space-x-2">
              <img src="/logo.png" alt="You Ballin" className="h-10 rounded" />
            </Link>

            {/* Desktop nav links */}
            <div className="hidden md:flex items-center space-x-4">
              <Link to="/" className="text-gray-600 dark:text-gray-300 hover:text-court-600 transition-colors px-3 py-2 rounded-md text-sm font-medium">
                Dashboard
              </Link>
              <Link to="/games" className="text-gray-600 dark:text-gray-300 hover:text-court-600 transition-colors px-3 py-2 rounded-md text-sm font-medium">
                Games
              </Link>
              <Link to="/players" className="text-gray-600 dark:text-gray-300 hover:text-court-600 transition-colors px-3 py-2 rounded-md text-sm font-medium">
                Players
              </Link>
              <Link to="/stats" className="text-gray-600 dark:text-gray-300 hover:text-court-600 transition-colors px-3 py-2 rounded-md text-sm font-medium">
                Stats
              </Link>
              {canAccessAdmin && (
                <Link to="/admin" className="text-gray-600 dark:text-gray-300 hover:text-court-600 transition-colors px-3 py-2 rounded-md text-sm font-medium">
                  Admin
                </Link>
              )}

              {/* Run Switcher */}
              <div className="flex items-center space-x-2">
                {runs.length > 0 && (
                  <select
                    value={currentRun?.id || ""}
                    onChange={(e) => {
                      const run = runs.find(r => r.id === parseInt(e.target.value));
                      if (run) setCurrentRun(run);
                    }}
                    className="text-sm border-gray-300 dark:border-gray-600 rounded-md px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:ring-court-500 focus:border-court-500"
                  >
                    {runs.map(run => (
                      <option key={run.id} value={run.id}>{run.name}</option>
                    ))}
                  </select>
                )}
                {isSuperAdmin && (
                  <button
                    onClick={() => setShowCreateRun(true)}
                    className="text-sm bg-court-600 text-white rounded-md px-2 py-1.5 hover:bg-court-700 transition-colors"
                    title="Create new run"
                  >
                    + Run
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right side: notifications + theme + user + mobile hamburger */}
          <div className="flex items-center space-x-3 sm:space-x-4">
            <Link to="/notifications" className="relative p-2 text-gray-500 dark:text-gray-400 hover:text-court-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>

            <button
              onClick={() => setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")}
              className="p-2 text-gray-500 dark:text-gray-400 hover:text-court-600 dark:hover:text-court-400 transition-colors"
              title={`Theme: ${theme}`}
            >
              {theme === "dark" ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              ) : theme === "light" ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              )}
            </button>

            {/* Desktop user info */}
            <div className="hidden md:flex items-center space-x-3">
              <Link to={`/players/${user?.id}`} className="flex items-center space-x-2 hover:opacity-80 transition-opacity">
                {user?.avatar_url ? (
                  <AvatarBadge avatarId={user.avatar_url} size="sm" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-court-100 flex items-center justify-center text-court-600 font-bold text-sm">
                    {user?.full_name?.charAt(0)}
                  </div>
                )}
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{user?.full_name}</span>
              </Link>
              <button onClick={handleLogout} className="text-sm text-gray-500 dark:text-gray-400 hover:text-red-500 transition-colors">
                Logout
              </button>
            </div>

            {/* Mobile hamburger button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-gray-500 dark:text-gray-400 hover:text-court-600 transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-lg">
          <div className="px-4 py-3 space-y-1">
            {/* Nav links */}
            <Link to="/" onClick={closeMobileMenu} className="block text-gray-700 dark:text-gray-300 hover:bg-court-50 dark:hover:bg-gray-700 hover:text-court-600 px-3 py-2.5 rounded-md text-sm font-medium">
              Dashboard
            </Link>
            <Link to="/games" onClick={closeMobileMenu} className="block text-gray-700 dark:text-gray-300 hover:bg-court-50 dark:hover:bg-gray-700 hover:text-court-600 px-3 py-2.5 rounded-md text-sm font-medium">
              Games
            </Link>
            <Link to="/players" onClick={closeMobileMenu} className="block text-gray-700 dark:text-gray-300 hover:bg-court-50 dark:hover:bg-gray-700 hover:text-court-600 px-3 py-2.5 rounded-md text-sm font-medium">
              Players
            </Link>
            <Link to="/stats" onClick={closeMobileMenu} className="block text-gray-700 dark:text-gray-300 hover:bg-court-50 dark:hover:bg-gray-700 hover:text-court-600 px-3 py-2.5 rounded-md text-sm font-medium">
              Stats
            </Link>
            {canAccessAdmin && (
              <Link to="/admin" onClick={closeMobileMenu} className="block text-gray-700 dark:text-gray-300 hover:bg-court-50 dark:hover:bg-gray-700 hover:text-court-600 px-3 py-2.5 rounded-md text-sm font-medium">
                Admin
              </Link>
            )}

            {/* Divider */}
            <div className="border-t border-gray-100 dark:border-gray-700 my-2" />

            {/* Run Switcher */}
            {runs.length > 0 && (
              <div className="px-3 py-2">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Current Run</label>
                <select
                  value={currentRun?.id || ""}
                  onChange={(e) => {
                    const run = runs.find(r => r.id === parseInt(e.target.value));
                    if (run) setCurrentRun(run);
                  }}
                  className="w-full text-sm border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:ring-court-500 focus:border-court-500"
                >
                  {runs.map(run => (
                    <option key={run.id} value={run.id}>{run.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Create Run */}
            {isSuperAdmin && (
              <button
                onClick={() => { setShowCreateRun(true); closeMobileMenu(); }}
                className="w-full text-left text-sm bg-court-50 dark:bg-court-900/20 text-court-700 dark:text-court-400 font-medium px-3 py-2.5 rounded-md hover:bg-court-100 dark:hover:bg-court-900/30 transition-colors"
              >
                + Create New Run
              </button>
            )}

            {/* Divider */}
            <div className="border-t border-gray-100 dark:border-gray-700 my-2" />

            {/* User info & logout */}
            <Link to={`/players/${user?.id}`} onClick={closeMobileMenu} className="flex items-center space-x-2 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md">
              {user?.avatar_url ? (
                <AvatarBadge avatarId={user.avatar_url} size="sm" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-court-100 flex items-center justify-center text-court-600 font-bold text-sm">
                  {user?.full_name?.charAt(0)}
                </div>
              )}
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{user?.full_name}</span>
            </Link>
            <button
              onClick={() => { handleLogout(); closeMobileMenu(); }}
              className="w-full text-left text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 px-3 py-2.5 rounded-md font-medium"
            >
              Logout
            </button>
          </div>
        </div>
      )}

      {/* Create Run Modal */}
      {showCreateRun && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowCreateRun(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Create New Run</h2>
            <form onSubmit={handleCreateRun}>
              <input
                type="text"
                value={newRunName}
                onChange={(e) => setNewRunName(e.target.value)}
                placeholder="Run name (e.g. Wednesday Night Hoops)"
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-md px-3 py-2 text-sm focus:ring-court-500 focus:border-court-500 mb-4"
                autoFocus
              />
              <div className="flex justify-end space-x-3">
                <button type="button" onClick={() => setShowCreateRun(false)} className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 px-4 py-2">
                  Cancel
                </button>
                <button type="submit" disabled={creating || !newRunName.trim()} className="text-sm bg-court-600 text-white rounded-md px-4 py-2 hover:bg-court-700 disabled:opacity-50">
                  {creating ? "Creating..." : "Create Run"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </nav>
  );
}
