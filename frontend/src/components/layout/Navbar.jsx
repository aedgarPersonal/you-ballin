/**
 * Navigation Bar
 * ==============
 * Top navigation with links, run switcher, notifications badge, and user menu.
 * Includes a mobile hamburger menu with admin access and run management.
 */

import { Link, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import useAuthStore from "../../stores/authStore";
import useNotificationStore from "../../stores/notificationStore";
import useRunStore from "../../stores/runStore";
import useThemeStore from "../../stores/themeStore";
import { createRun } from "../../api/runs";
import { generateSeasonGames } from "../../api/games";
import { AvatarBadge } from "../AvatarPicker";
import Logo from "./Logo";
import { InstallButton } from "../InstallPrompt";
import toast from "react-hot-toast";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function Navbar() {
  const { user, logout } = useAuthStore();
  const { unreadCount, fetchNotifications } = useNotificationStore();
  const { runs, currentRun, setCurrentRun, fetchRuns, isRunAdmin } = useRunStore();
  const navigate = useNavigate();
  const [showCreateRun, setShowCreateRun] = useState(false);
  const [newRun, setNewRun] = useState({ name: "", default_game_day: "", default_game_time: "", default_location: "", start_date: "", end_date: "" });
  const [creating, setCreating] = useState(false);
  const [createdRun, setCreatedRun] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { theme, setTheme } = useThemeStore();

  const location = useLocation();
  const isSuperAdmin = user?.role === "super_admin";
  const canAccessAdmin = isSuperAdmin || isRunAdmin;

  const isActive = (path) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  const navLinkClass = (path) =>
    `relative px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
      isActive(path)
        ? "text-court-600 dark:text-court-400 bg-court-50 dark:bg-court-900/30"
        : "text-gray-600 dark:text-gray-300 hover:text-court-600 dark:hover:text-court-400 hover:bg-gray-50 dark:hover:bg-gray-700/50"
    }`;

  const handleCreateRun = async (e) => {
    e.preventDefault();
    if (!newRun.name.trim()) return;
    setCreating(true);
    try {
      const payload = { name: newRun.name.trim() };
      if (newRun.default_game_day !== "") payload.default_game_day = parseInt(newRun.default_game_day);
      if (newRun.default_game_time) payload.default_game_time = newRun.default_game_time;
      if (newRun.default_location) payload.default_location = newRun.default_location;
      if (newRun.start_date) payload.start_date = newRun.start_date;
      if (newRun.end_date) payload.end_date = newRun.end_date;
      const { data } = await createRun(payload);
      await fetchRuns();
      setCurrentRun(data);
      // Check if all schedule fields are set — offer to generate season
      const hasSchedule = payload.default_game_day !== undefined && payload.default_game_time && payload.start_date && payload.end_date;
      if (hasSchedule) {
        setCreatedRun(data);
      } else {
        setShowCreateRun(false);
      }
      setNewRun({ name: "", default_game_day: "", default_game_time: "", default_location: "", start_date: "", end_date: "" });
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
    <nav className="fixed top-0 left-0 right-0 z-50">
      {/* Gradient accent bar */}
      <div className="h-1 bg-gradient-to-r from-court-400 via-court-500 to-court-700" />

      {/* Main navbar */}
      <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-700/50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo & Nav Links */}
            <div className="flex items-center space-x-8">
              <Link to="/" className="flex items-center">
                <Logo size="sm" />
              </Link>

              {/* Desktop nav links */}
              <div className="hidden md:flex items-center space-x-1">
                <Link to="/" className={navLinkClass("/")}>
                  Dashboard
                </Link>
                <Link to="/games" className={navLinkClass("/games")}>
                  Games
                </Link>
                <Link to="/players" className={navLinkClass("/players")}>
                  Players
                </Link>
                <Link to="/stats" className={navLinkClass("/stats")}>
                  Stats
                </Link>
                {canAccessAdmin && (
                  <Link to="/admin" className={navLinkClass("/admin")}>
                    Admin
                  </Link>
                )}

                {/* Run Switcher - separated with a subtle divider */}
                <div className="flex items-center space-x-2 ml-3 pl-3 border-l border-gray-200 dark:border-gray-700">
                  {runs.length > 0 && (
                    <select
                      value={currentRun?.id || ""}
                      onChange={(e) => {
                        const run = runs.find(r => r.id === parseInt(e.target.value));
                        if (run) setCurrentRun(run);
                      }}
                      className="text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-1.5 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-court-500 focus:border-court-500 transition-all"
                    >
                      {runs.map(run => (
                        <option key={run.id} value={run.id}>{run.name}</option>
                      ))}
                    </select>
                  )}
                  {isSuperAdmin && (
                    <button
                      onClick={() => setShowCreateRun(true)}
                      className="text-sm bg-gradient-to-r from-court-500 to-court-600 text-white rounded-lg px-3 py-1.5 hover:from-court-600 hover:to-court-700 transition-all shadow-sm hover:shadow-md"
                      title="Create new run"
                    >
                      + Run
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Right side: notifications + theme + user + mobile hamburger */}
            <div className="flex items-center space-x-1 sm:space-x-2">
              <Link to="/notifications" className="relative p-2 text-gray-500 dark:text-gray-400 hover:text-court-600 dark:hover:text-court-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-gradient-to-r from-red-500 to-red-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold shadow-sm animate-pulse">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Link>

              <button
                onClick={() => setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")}
                className="p-2 text-gray-500 dark:text-gray-400 hover:text-court-600 dark:hover:text-court-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all"
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

              {/* Install app button (desktop) */}
              <InstallButton className="hidden sm:inline-flex" />

              {/* Desktop user info */}
              <div className="hidden md:flex items-center space-x-2 ml-2 pl-2 border-l border-gray-200 dark:border-gray-700">
                <Link to={`/players/${user?.id}`} className="flex items-center space-x-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all">
                  {user?.avatar_url ? (
                    <AvatarBadge avatarId={user.avatar_url} size="sm" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-court-400 to-court-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                      {user?.full_name?.charAt(0)}
                    </div>
                  )}
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{user?.full_name}</span>
                </Link>
                <button onClick={handleLogout} className="text-sm text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20">
                  <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              </div>

              {/* Mobile hamburger button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 text-gray-500 dark:text-gray-400 hover:text-court-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all"
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
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-700/50 shadow-lg">
          <div className="px-4 py-3 space-y-1">
            {/* Nav links */}
            <Link to="/" onClick={closeMobileMenu} className={`block ${navLinkClass("/")}`}>
              Dashboard
            </Link>
            <Link to="/games" onClick={closeMobileMenu} className={`block ${navLinkClass("/games")}`}>
              Games
            </Link>
            <Link to="/players" onClick={closeMobileMenu} className={`block ${navLinkClass("/players")}`}>
              Players
            </Link>
            <Link to="/stats" onClick={closeMobileMenu} className={`block ${navLinkClass("/stats")}`}>
              Stats
            </Link>
            {canAccessAdmin && (
              <Link to="/admin" onClick={closeMobileMenu} className={`block ${navLinkClass("/admin")}`}>
                Admin
              </Link>
            )}

            {/* Divider */}
            <div className="border-t border-gray-100 dark:border-gray-700/50 my-2" />

            {/* Run Switcher */}
            {runs.length > 0 && (
              <div className="px-3 py-2">
                <label className="block text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">Current Run</label>
                <select
                  value={currentRun?.id || ""}
                  onChange={(e) => {
                    const run = runs.find(r => r.id === parseInt(e.target.value));
                    if (run) setCurrentRun(run);
                  }}
                  className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-court-500 focus:border-court-500"
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
                className="w-full text-left text-sm bg-gradient-to-r from-court-50 to-court-100 dark:from-court-900/20 dark:to-court-900/30 text-court-700 dark:text-court-400 font-medium px-3 py-2.5 rounded-lg hover:from-court-100 hover:to-court-200 dark:hover:from-court-900/30 dark:hover:to-court-900/40 transition-all"
              >
                + Create New Run
              </button>
            )}

            {/* Install app button (mobile) */}
            <InstallButton className="w-full justify-center py-2.5" />

            {/* Divider */}
            <div className="border-t border-gray-100 dark:border-gray-700/50 my-2" />

            {/* User info & logout */}
            <Link to={`/players/${user?.id}`} onClick={closeMobileMenu} className="flex items-center space-x-2 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-all">
              {user?.avatar_url ? (
                <AvatarBadge avatarId={user.avatar_url} size="sm" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-court-400 to-court-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                  {user?.full_name?.charAt(0)}
                </div>
              )}
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{user?.full_name}</span>
            </Link>
            <button
              onClick={() => { handleLogout(); closeMobileMenu(); }}
              className="w-full text-left text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 px-3 py-2.5 rounded-lg font-medium transition-all"
            >
              Logout
            </button>
          </div>
        </div>
      )}

      {/* Create Run Modal */}
      {showCreateRun && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => { setShowCreateRun(false); setCreatedRun(null); }}>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {createdRun ? (
              /* Step 2: Generate Season Games Prompt */
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Run Created!</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  <strong>{createdRun.name}</strong> is set up with a schedule:
                </p>
                <div className="bg-court-50 dark:bg-court-900/20 border border-court-200 dark:border-court-800 rounded-lg p-3 mb-4">
                  <p className="text-sm text-court-800 dark:text-court-300">
                    Every <strong>{DAY_NAMES[createdRun.default_game_day]}</strong> at <strong>{createdRun.default_game_time}</strong>
                  </p>
                  <p className="text-xs text-court-600 dark:text-court-400 mt-1">
                    {new Date(createdRun.start_date + "T00:00").toLocaleDateString()} — {new Date(createdRun.end_date + "T00:00").toLocaleDateString()}
                  </p>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Generate all season games now?</p>
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => { setShowCreateRun(false); setCreatedRun(null); }}
                    className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 px-4 py-2"
                  >
                    Skip for Now
                  </button>
                  <button
                    onClick={async () => {
                      setGenerating(true);
                      try {
                        const { data } = await generateSeasonGames(createdRun.id);
                        toast.success(`Created ${data.games_created} games for ${data.total_weeks} weeks!`);
                      } catch (err) {
                        toast.error(err.response?.data?.detail || "Failed to generate games");
                      } finally {
                        setGenerating(false);
                        setShowCreateRun(false);
                        setCreatedRun(null);
                      }
                    }}
                    disabled={generating}
                    className="text-sm bg-court-600 text-white rounded-md px-4 py-2 hover:bg-court-700 disabled:opacity-50"
                  >
                    {generating ? "Generating..." : "Generate Games"}
                  </button>
                </div>
              </div>
            ) : (
              /* Step 1: Create Run Form */
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Create New Run</h2>
                <form onSubmit={handleCreateRun} className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Run Name *</label>
                    <input
                      type="text"
                      value={newRun.name}
                      onChange={(e) => setNewRun({ ...newRun, name: e.target.value })}
                      placeholder="e.g. Monday Night Hoops"
                      className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-md px-3 py-2 text-sm focus:ring-court-500 focus:border-court-500"
                      autoFocus
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Schedule Day</label>
                      <select
                        value={newRun.default_game_day}
                        onChange={(e) => setNewRun({ ...newRun, default_game_day: e.target.value })}
                        className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-md px-3 py-2 text-sm focus:ring-court-500 focus:border-court-500"
                      >
                        <option value="">Select day...</option>
                        {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Game Time</label>
                      <input
                        type="time"
                        value={newRun.default_game_time}
                        onChange={(e) => setNewRun({ ...newRun, default_game_time: e.target.value })}
                        className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-md px-3 py-2 text-sm focus:ring-court-500 focus:border-court-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Location</label>
                    <input
                      type="text"
                      value={newRun.default_location}
                      onChange={(e) => setNewRun({ ...newRun, default_location: e.target.value })}
                      placeholder="e.g. Downtown Rec Center"
                      className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-md px-3 py-2 text-sm focus:ring-court-500 focus:border-court-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Season Start</label>
                      <input
                        type="date"
                        value={newRun.start_date}
                        onChange={(e) => setNewRun({ ...newRun, start_date: e.target.value })}
                        className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-md px-3 py-2 text-sm focus:ring-court-500 focus:border-court-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Season End</label>
                      <input
                        type="date"
                        value={newRun.end_date}
                        onChange={(e) => setNewRun({ ...newRun, end_date: e.target.value })}
                        className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-md px-3 py-2 text-sm focus:ring-court-500 focus:border-court-500"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Schedule and dates are optional. You can set them later in Run Settings.</p>
                  <div className="flex justify-end space-x-3 pt-2">
                    <button type="button" onClick={() => setShowCreateRun(false)} className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 px-4 py-2">
                      Cancel
                    </button>
                    <button type="submit" disabled={creating || !newRun.name.trim()} className="text-sm bg-court-600 text-white rounded-md px-4 py-2 hover:bg-court-700 disabled:opacity-50">
                      {creating ? "Creating..." : "Create Run"}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
