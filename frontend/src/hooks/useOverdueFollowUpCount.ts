import { useEffect, useState } from 'react';
import { followUpService } from '../services/followUpService';
import { NOTIFICATION_POLL_MS } from './useNotifications';

const CHANGED = 'follow-ups:changed';

/** Tells the menu badge to re-count now, after a follow-up was scheduled, completed or moved. */
export function followUpsChanged(): void {
  window.dispatchEvent(new Event(CHANGED));
}

/** Calls `listener` whenever this tab changes a follow-up; returns the unsubscribe. */
export function onFollowUpsChanged(listener: () => void): () => void {
  window.addEventListener(CHANGED, listener);
  return () => window.removeEventListener(CHANGED, listener);
}

/**
 * The caller's overdue follow-ups, for the menu badge (FR-FUP-07). Polled on
 * the bell's 60 s rhythm and re-counted at once when this tab changes a
 * follow-up. A failed poll keeps the last count rather than showing zero.
 */
export function useOverdueFollowUpCount(tenantSlug: string | null | undefined, enabled: boolean, pollMs: number = NOTIFICATION_POLL_MS): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled || !tenantSlug) return;
    let current = true;
    const refresh = () => {
      followUpService
        .overdueCount(tenantSlug)
        .then((value) => current && setCount(value))
        .catch(() => undefined);
    };
    refresh();
    const timer = window.setInterval(refresh, pollMs);
    const unsubscribe = onFollowUpsChanged(refresh);
    return () => {
      current = false;
      window.clearInterval(timer);
      unsubscribe();
    };
  }, [tenantSlug, enabled, pollMs]);

  return enabled ? count : 0;
}
