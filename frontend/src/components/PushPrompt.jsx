/**
 * PushPrompt — prompts authenticated users to enable push notifications.
 * Shows once after login. Dismissal is remembered for 7 days.
 */

import { useState, useEffect } from "react";
import { isPushSupported, getPushPermission, subscribeToPush, isSubscribedToPush } from "../utils/pushNotifications";

const DISMISS_KEY = "push-prompt-dismissed";
const DISMISS_DAYS = 7;

export default function PushPrompt() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    (async () => {
      if (!isPushSupported()) return;

      const permission = getPushPermission();
      if (permission === "denied") return;

      // If already granted, silently ensure subscription exists
      if (permission === "granted") {
        const subscribed = await isSubscribedToPush();
        if (!subscribed) await subscribeToPush();
        return;
      }

      // Check if dismissed recently
      const dismissed = localStorage.getItem(DISMISS_KEY);
      if (dismissed) {
        const dismissedAt = new Date(dismissed);
        const daysSince = (Date.now() - dismissedAt.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince < DISMISS_DAYS) return;
      }

      setVisible(true);
    })();
  }, []);

  const handleEnable = async () => {
    await subscribeToPush();
    setVisible(false);
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, new Date().toISOString());
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 z-50 animate-slide-up">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl flex-shrink-0">🔔</span>
          <div className="flex-1">
            <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
              Enable notifications
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Get notified about game invites, team announcements, and voting on this device.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleEnable}
                className="btn-primary text-xs py-1.5 px-3"
              >
                Enable
              </button>
              <button
                onClick={handleDismiss}
                className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 py-1.5 px-3"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
