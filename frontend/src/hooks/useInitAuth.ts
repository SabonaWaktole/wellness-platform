import { useEffect } from 'react';
import { authService } from '../services/authService';
import { useAuthStore } from '../store/useAuthStore';
import { setPermissionsVersionListener } from '../api';

/**
 * Hook to initialize auth state on app load.
 * Calls GET /me to check if the user has an active session (httpOnly cookie).
 */
export const useInitAuth = () => {
  const { setUser, setInitializing } = useAuthStore();

  useEffect(() => {
    const init = async () => {
      try {
        // getSession rather than getMe: the impersonation flag has to be part of
        // session bootstrap so the "you are managing X" banner survives a
        // reload. Without it, an administrator who refreshed would be operating
        // inside a client's workspace with nothing on screen saying so.
        const { user, impersonating } = await authService.getSession();
        setUser(user, impersonating);
      } catch {
        // Not authenticated — that's fine, just leave user as null
      } finally {
        setInitializing(false);
      }
    };

    init();
  }, [setUser, setInitializing]);

  /*
   * FR-USR-03: "a role change applies on the user's next page load, no
   * re-login". `X-Permissions-Version` rides on every tenant-scoped
   * response; when it disagrees with what session bootstrap last stored,
   * something changed this user's grants server-side (a role edit, a
   * deactivation, a permission grant on their role) and the session is
   * refetched so the nav and route guards catch up within the same page
   * load, not on the next one.
   */
  useEffect(() => {
    const onVersion = (version: string) => {
      const current = useAuthStore.getState().user;
      if (current && current.permissionsVersion && current.permissionsVersion !== version) {
        authService.getSession().then(({ user, impersonating }) => setUser(user, impersonating));
      }
    };
    setPermissionsVersionListener(onVersion);
    return () => setPermissionsVersionListener(null);
  }, [setUser]);
};
