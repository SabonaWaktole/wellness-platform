import { useAuthStore } from '../store/useAuthStore';

/**
 * FR-RBAC-07: the menu, pages and actions shown in the frontend are derived
 * from the user's permissions, never from `role`. Reads straight from the
 * `permissions` map `GET /auth/me` put on the auth user.
 */
export function usePermission(key: string): boolean {
  return useAuthStore((state) => state.user?.permissions?.[key] !== undefined);
}

/** The scope `key` is held at, or `null` when unheld or a plain (unscoped) capability. */
export function usePermissionScope(key: string): 'OWN' | 'TEAM' | 'ALL' | null {
  return useAuthStore((state) => {
    const grant = state.user?.permissions?.[key];
    return grant === true || grant === undefined ? null : grant;
  });
}
