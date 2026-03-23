/**
 * Notifications Page
 * ==================
 * In-app notification feed.
 */

import { useEffect } from "react";
import useNotificationStore from "../stores/notificationStore";

const TYPE_ICONS = {
  game_invite: "📅",
  dropin_available: "🏃",
  rsvp_reminder: "⏰",
  teams_published: "📋",
  registration_approved: "✅",
  registration_denied: "❌",
  general: "📢",
};

export default function NotificationsPage() {
  const { notifications, unreadCount, loading, fetchNotifications, markRead, markAllRead } =
    useNotificationStore();

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          {unreadCount > 0 && (
            <p className="text-sm text-gray-500">{unreadCount} unread</p>
          )}
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllRead} className="btn-secondary text-sm">
            Mark All Read
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : notifications.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500">No notifications yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((notif) => (
            <div
              key={notif.id}
              onClick={() => !notif.read && markRead(notif.id)}
              className={`card cursor-pointer transition-colors ${
                !notif.read ? "bg-court-50 border-court-200" : ""
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">{TYPE_ICONS[notif.type] || "📢"}</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className={`font-semibold ${!notif.read ? "text-gray-900" : "text-gray-600"}`}>
                      {notif.title}
                    </h3>
                    <span className="text-xs text-gray-400">
                      {new Date(notif.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{notif.message}</p>
                  <div className="flex gap-2 mt-2">
                    {notif.email_sent && <span className="text-xs text-gray-400">📧 Email sent</span>}
                    {notif.sms_sent && <span className="text-xs text-gray-400">📱 SMS sent</span>}
                  </div>
                </div>
                {!notif.read && (
                  <span className="w-2 h-2 bg-court-500 rounded-full flex-shrink-0 mt-2"></span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
