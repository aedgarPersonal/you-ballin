/**
 * Navigation Bar
 * ==============
 * Top navigation with links, notifications badge, and user menu.
 */

import { Link, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import useAuthStore from "../../stores/authStore";
import useNotificationStore from "../../stores/notificationStore";

export default function Navbar() {
  const { user, logout } = useAuthStore();
  const { unreadCount, fetchNotifications } = useNotificationStore();
  const navigate = useNavigate();

  useEffect(() => {
    fetchNotifications();
    // Poll for new notifications every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <nav className="fixed top-0 left-0 right-0 bg-white border-b border-gray-200 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Nav Links */}
          <div className="flex items-center space-x-8">
            <Link to="/" className="flex items-center space-x-2">
              <span className="text-2xl">🏀</span>
              <span className="font-bold text-xl text-court-600">You Ballin</span>
            </Link>

            <div className="hidden md:flex items-center space-x-4">
              <Link to="/" className="text-gray-600 hover:text-court-600 transition-colors px-3 py-2 rounded-md text-sm font-medium">
                Dashboard
              </Link>
              <Link to="/games" className="text-gray-600 hover:text-court-600 transition-colors px-3 py-2 rounded-md text-sm font-medium">
                Games
              </Link>
              <Link to="/players" className="text-gray-600 hover:text-court-600 transition-colors px-3 py-2 rounded-md text-sm font-medium">
                Players
              </Link>
              {user?.role === "admin" && (
                <Link to="/admin" className="text-gray-600 hover:text-court-600 transition-colors px-3 py-2 rounded-md text-sm font-medium">
                  Admin
                </Link>
              )}
            </div>
          </div>

          {/* Right side: notifications + user */}
          <div className="flex items-center space-x-4">
            <Link to="/notifications" className="relative p-2 text-gray-500 hover:text-court-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>

            <div className="flex items-center space-x-3">
              <span className="text-sm font-medium text-gray-700">{user?.full_name}</span>
              <span className={user?.player_status === "regular" ? "badge-regular" : "badge-dropin"}>
                {user?.player_status}
              </span>
              <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-red-500 transition-colors">
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
