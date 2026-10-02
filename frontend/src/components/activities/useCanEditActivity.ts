import { useAuthStore } from '../../store/useAuthStore';
import type { ActivityView } from '../../types/client';

/** FR-ACT-06: the author edits their own activity for this long after recording it. */
export const AUTHOR_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Whether to offer "Edit" on an activity (FR-ACT-06): to its author for 24
 * hours, and to a holder of `activities.add` at Team scope or wider (the
 * Sales Manager) at any time. The server makes the same check; this only
 * decides what to show.
 */
export function useCanEditActivity(): (activity: Pick<ActivityView, 'channel' | 'recordedAt' | 'author'>) => boolean {
  const user = useAuthStore((state) => state.user);
  return (activity) => {
    const permissions = user?.permissions ?? {};
    const addKey = activity.channel === 'NOTE' ? 'notes.add' : 'activities.add';
    if (permissions[addKey] === undefined) return false;
    const managerScope = permissions['activities.add'];
    if (managerScope === 'TEAM' || managerScope === 'ALL') return true;
    const age = Date.now() - new Date(activity.recordedAt).getTime();
    return activity.author.id === user?.userId && age < AUTHOR_EDIT_WINDOW_MS;
  };
}
