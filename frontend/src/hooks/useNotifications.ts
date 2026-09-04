import { useState, useCallback, useEffect, useRef } from 'react';
import { apiClient as api } from '../api';
import { useParams } from 'react-router-dom';

export interface NotificationItem {
  id: string;
  /** i18n key suffix — rendered through `notifications:type.<type>`. */
  type: string;
  params: Record<string, string | number>;
  actorUserId: string | null;
  entityType: 'QUOTATION' | 'APPOINTMENT' | 'CLIENT' | 'FORM' | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

/**
 * How often the bell re-checks, in milliseconds.
 *
 * Polling rather than realtime: there is no WebSocket infrastructure in this
 * project, and adding one for a v1 notification feature would be the largest
 * piece of the work by far. A minute is frequent enough for the events this
 * carries — none of them are time-critical — and cheap enough not to matter.
 */
export const NOTIFICATION_POLL_MS = 60_000;

export const useNotifications = (pollMs: number = NOTIFICATION_POLL_MS) => {
  const { tenantSlug } = useParams();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Kept in a ref so the polling effect does not restart on every fetch.
  const inFlight = useRef(false);

  const fetchNotifications = useCallback(async () => {
    if (!tenantSlug || inFlight.current) return;
    inFlight.current = true;
    setIsLoading(true);
    try {
      const response = await api.get(`/${tenantSlug}/notifications`);
      setItems(response.data.items ?? []);
      setUnreadCount(response.data.unreadCount ?? 0);
    } catch (error) {
      // A failed poll leaves the previous list in place rather than blanking
      // the bell — a transient network error must not look like "all caught
      // up", which is a specific and misleading claim.
      console.error('Failed to fetch notifications', error);
    } finally {
      inFlight.current = false;
      setIsLoading(false);
    }
  }, [tenantSlug]);

  const markRead = useCallback(
    async (id: string) => {
      if (!tenantSlug) return;
      // Optimistic: the badge should drop the instant it is clicked.
      setItems((prev) =>
        prev.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      try {
        await api.patch(`/${tenantSlug}/notifications/${id}/read`);
      } catch (error) {
        console.error('Failed to mark notification read', error);
        // Re-sync rather than guess what the server ended up with.
        await fetchNotifications();
      }
    },
    [tenantSlug, fetchNotifications]
  );

  const markAllRead = useCallback(async () => {
    if (!tenantSlug) return;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })));
    setUnreadCount(0);
    try {
      await api.patch(`/${tenantSlug}/notifications/read-all`);
    } catch (error) {
      console.error('Failed to mark all notifications read', error);
      await fetchNotifications();
    }
  }, [tenantSlug, fetchNotifications]);

  useEffect(() => {
    fetchNotifications();
    if (pollMs <= 0) return;
    const timer = setInterval(fetchNotifications, pollMs);
    return () => clearInterval(timer);
  }, [fetchNotifications, pollMs]);

  return { items, unreadCount, isLoading, fetchNotifications, markRead, markAllRead };
};
