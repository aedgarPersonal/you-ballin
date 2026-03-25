/**
 * Web Push Notification Utilities
 * ================================
 * Handles browser push subscription lifecycle.
 */

import { getVapidKey, subscribePush, unsubscribePush } from "../api/notifications";

/** Check if this browser supports Web Push */
export function isPushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** Get current notification permission state */
export function getPushPermission() {
  return Notification.permission; // "default" | "granted" | "denied"
}

/** Convert VAPID public key from base64url to Uint8Array */
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

/**
 * Subscribe this device to push notifications.
 * Requests permission if needed, then registers with the backend.
 */
export async function subscribeToPush() {
  if (!isPushSupported()) return false;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  try {
    // Get VAPID public key from backend
    const { data } = await getVapidKey();
    if (!data.public_key) return false;

    // Get service worker registration
    const registration = await navigator.serviceWorker.ready;

    // Subscribe to push manager
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.public_key),
    });

    const sub = subscription.toJSON();

    // Send subscription to backend
    await subscribePush({
      endpoint: sub.endpoint,
      p256dh_key: sub.keys.p256dh,
      auth_key: sub.keys.auth,
      user_agent: navigator.userAgent.substring(0, 300),
    });

    return true;
  } catch (err) {
    console.error("Push subscription failed:", err);
    return false;
  }
}

/**
 * Unsubscribe this device from push notifications.
 */
export async function unsubscribeFromPush() {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
      await unsubscribePush(subscription.endpoint);
    }
    return true;
  } catch (err) {
    console.error("Push unsubscription failed:", err);
    return false;
  }
}

/**
 * Check if this device currently has an active push subscription.
 */
export async function isSubscribedToPush() {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return !!subscription;
  } catch {
    return false;
  }
}
