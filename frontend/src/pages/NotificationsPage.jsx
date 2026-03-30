/**
 * Notifications Page
 * ==================
 * In-app notification feed with deep linking. Retro themed.
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import useNotificationStore from "../stores/notificationStore";
import { isPushSupported, getPushPermission, subscribeToPush, unsubscribeFromPush, isSubscribedToPush } from "../utils/pushNotifications";

const TYPE_ICONS = {
  game_invite: "📅", dropin_available: "🏃", rsvp_reminder: "⏰",
  teams_published: "📋", registration_approved: "✅", registration_denied: "❌",
  awards_announced: "🏆", voting_open: "🗳️", game_cancelled: "🚫",
  game_updated: "📝", game_completed: "🏁", status_changed: "🔄",
  player_suggested: "👤", suggestion_accepted: "✅", suggestion_declined: "❌",
  general: "📢",
};

const ACTION_LABELS = {
  game_invite: "RSVP Now", dropin_available: "Grab Spot", rsvp_reminder: "Vote Now",
  voting_open: "Cast Votes", teams_published: "View Teams", game_completed: "Vote",
  awards_announced: "View Results", game_updated: "View Game", player_suggested: "Review",
  registration_approved: "Review", suggestion_accepted: "View",
};

export default function NotificationsPage() {
  const { notifications, unreadCount, loading, fetchNotifications, markRead, markAllRead, deleteOne, deleteAll } =
    useNotificationStore();
  const navigate = useNavigate();
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const pushSupported = isPushSupported();
  const pushDenied = pushSupported && getPushPermission() === "denied";

  useEffect(() => {
    fetchNotifications();
    if (pushSupported) isSubscribedToPush().then(setPushEnabled);
  }, [fetchNotifications]);

  const handleTogglePush = async () => {
    setPushLoading(true);
    try {
      if (pushEnabled) { await unsubscribeFromPush(); setPushEnabled(false); }
      else { const ok = await subscribeToPush(); setPushEnabled(ok); }
    } finally { setPushLoading(false); }
  };

  const handleClick = (notif) => {
    if (!notif.read) markRead(notif.id);
    if (notif.action_url) navigate(notif.action_url);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-retro text-base text-gray-100">ALERTS</h1>
          {unreadCount > 0 && (
            <p className="text-xs text-court-500 mt-1">{unreadCount} unread</p>
          )}
        </div>
        <div className="flex gap-2">
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="text-xs text-gray-400 hover:text-gray-200 font-medium px-3 py-1.5 border border-gray-700 rounded-lg">
              Mark All Read
            </button>
          )}
          {notifications.length > 0 && (
            <button onClick={() => { if (confirm("Delete all notifications?")) deleteAll(); }}
              className="text-xs text-red-400 hover:text-red-300 font-medium px-3 py-1.5">
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Push Toggle */}
      {pushSupported && (
        <div className="rounded-xl bg-gradient-to-b from-arcade-500 to-arcade-700 p-[2px] mb-6">
          <div className="rounded-[10px] bg-gray-950 px-4 py-3 flex items-center justify-between">
            <div>
              <h3 className="font-retro text-[8px] text-white">PUSH NOTIFICATIONS</h3>
              <p className="text-[10px] text-gray-500 mt-1">
                {pushDenied ? "Blocked — update browser settings"
                  : pushEnabled ? "Alerts active on this device"
                  : "Enable device alerts"}
              </p>
            </div>
            <button onClick={handleTogglePush} disabled={pushLoading || pushDenied}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors ${
                pushEnabled ? "bg-court-600" : "bg-gray-700"
              } ${pushDenied ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
              <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                pushEnabled ? "translate-x-5" : "translate-x-0"
              }`} />
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : notifications.length === 0 ? (
        <div className="rounded-xl bg-gradient-to-b from-gray-600 to-gray-700 p-[1.5px]">
          <div className="rounded-[10px] bg-gray-950 py-12 text-center">
            <p className="text-gray-500">No notifications yet.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((notif) => {
            const actionLabel = ACTION_LABELS[notif.type];
            const hasAction = notif.action_url && actionLabel;
            const isUnread = !notif.read;

            return (
              <div key={notif.id} onClick={() => handleClick(notif)}
                className={`rounded-xl ${isUnread ? "bg-gradient-to-b from-court-500 to-court-700" : "bg-gradient-to-b from-gray-600 to-gray-700"} p-[1.5px] cursor-pointer transition-shadow hover:shadow-lg`}>
                <div className="rounded-[10px] bg-gray-950 px-4 py-3">
                  <div className="flex items-start gap-3">
                    <span className="text-xl">{TYPE_ICONS[notif.type] || "📢"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className={`text-sm font-semibold truncate ${isUnread ? "text-white" : "text-gray-400"}`}>
                          {notif.title}
                        </h3>
                        <span className="text-[10px] text-gray-600 flex-shrink-0">
                          {new Date(notif.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{notif.message}</p>
                      {hasAction && (
                        <span className="inline-block mt-1.5 text-[10px] font-bold text-court-400">{actionLabel} →</span>
                      )}
                    </div>
                    <div className="flex flex-col items-center gap-1 flex-shrink-0 mt-1">
                      {isUnread && <span className="w-2 h-2 bg-court-500 rounded-full" />}
                      <button onClick={(e) => { e.stopPropagation(); deleteOne(notif.id); }}
                        className="text-gray-600 hover:text-red-400 text-xs p-1" title="Delete">&times;</button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
