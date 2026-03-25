/**
 * Notifications Page
 * ==================
 * In-app notification feed with deep linking.
 */

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import useNotificationStore from "../stores/notificationStore";

const TYPE_ICONS = {
  game_invite: "📅",
  dropin_available: "🏃",
  rsvp_reminder: "⏰",
  teams_published: "📋",
  registration_approved: "✅",
  registration_denied: "❌",
  awards_announced: "🏆",
  voting_open: "🗳️",
  game_cancelled: "🚫",
  game_updated: "📝",
  game_completed: "🏁",
  status_changed: "🔄",
  player_suggested: "👤",
  suggestion_accepted: "✅",
  suggestion_declined: "❌",
  general: "📢",
};

const ACTION_LABELS = {
  game_invite: "RSVP Now",
  dropin_available: "Grab Spot",
  rsvp_reminder: "Vote Now",
  voting_open: "Cast Votes",
  teams_published: "View Teams",
  game_completed: "Vote",
  awards_announced: "View Results",
  game_updated: "View Game",
  player_suggested: "Review",
  registration_approved: "View Games",
  suggestion_accepted: "View",
};

export default function NotificationsPage() {
  const { notifications, unreadCount, loading, fetchNotifications, markRead, markAllRead } =
    useNotificationStore();
  const navigate = useNavigate();

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleClick = (notif) => {
    if (!notif.read) markRead(notif.id);
    if (notif.action_url) navigate(notif.action_url);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Notifications</h1>
          {unreadCount > 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400">{unreadCount} unread</p>
          )}
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllRead} className="btn-secondary text-sm">
            Mark All Read
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-gray-500 dark:text-gray-400">Loading...</p>
      ) : notifications.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500 dark:text-gray-400">No notifications yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((notif) => {
            const actionLabel = ACTION_LABELS[notif.type];
            const hasAction = notif.action_url && actionLabel;

            return (
              <div
                key={notif.id}
                onClick={() => handleClick(notif)}
                className={`card cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 ${
                  !notif.read
                    ? "bg-court-50 dark:bg-court-950/20 border-court-200 dark:border-court-800"
                    : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{TYPE_ICONS[notif.type] || "📢"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3
                        className={`font-semibold truncate ${
                          !notif.read
                            ? "text-gray-900 dark:text-gray-100"
                            : "text-gray-600 dark:text-gray-400"
                        }`}
                      >
                        {notif.title}
                      </h3>
                      <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                        {new Date(notif.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                      {notif.message}
                    </p>
                    {hasAction && (
                      <span className="inline-block mt-2 text-xs font-semibold text-court-600 dark:text-court-400">
                        {actionLabel} →
                      </span>
                    )}
                  </div>
                  {!notif.read && (
                    <span className="w-2 h-2 bg-court-500 rounded-full flex-shrink-0 mt-2"></span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
