/**
 * Notification Store (Zustand)
 * ============================
 * Manages in-app notification state and polling.
 */

import { create } from "zustand";
import { listNotifications, markAsRead, markAllAsRead, deleteNotification, deleteAllNotifications } from "../api/notifications";

const useNotificationStore = create((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,

  fetchNotifications: async () => {
    set({ loading: true });
    try {
      const { data } = await listNotifications({ limit: 20 });
      set({
        notifications: data.notifications,
        unreadCount: data.unread_count,
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },

  markRead: async (id) => {
    await markAsRead(id);
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }));
  },

  markAllRead: async () => {
    await markAllAsRead();
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }));
  },

  deleteOne: async (id) => {
    await deleteNotification(id);
    set((state) => {
      const notif = state.notifications.find((n) => n.id === id);
      const wasUnread = notif && !notif.read;
      return {
        notifications: state.notifications.filter((n) => n.id !== id),
        unreadCount: wasUnread ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
      };
    });
  },

  deleteAll: async () => {
    await deleteAllNotifications();
    set({ notifications: [], unreadCount: 0 });
  },
}));

export default useNotificationStore;
