import { useCallback, useEffect, useState } from 'react';
import { dashboardService } from '../services/dashboardService';
import type {
  PlatformUser,
  PlatformUserFilters,
  CreatePlatformUserInput,
  CreatePlatformAdminInput,
  InvitePlatformUserInput,
} from '../services/dashboardService';

/**
 * Every account on the platform, for the admin console's People page.
 *
 * The only cross-workspace read in the app. Filters live in state here rather
 * than in the page so a refetch after creating a user preserves whatever the
 * operator was looking at.
 */
export const usePlatformUsers = (initial: PlatformUserFilters = {}) => {
  const [filters, setFilters] = useState<PlatformUserFilters>({ take: 50, ...initial });
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async (next: PlatformUserFilters) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await dashboardService.getPlatformUsers(next);
      setUsers(data.items);
      setTotal(data.total);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers(filters);
  }, [filters, fetchUsers]);

  return {
    users,
    total,
    isLoading,
    error,
    filters,
    setFilters,
    refresh: useCallback(() => fetchUsers(filters), [fetchUsers, filters]),
  };
};

/**
 * Creating an account from the console, in a chosen workspace.
 *
 * Separate from the listing hook for the same reason `useTenantAdmin` is
 * separate from `useTenants`: reading and writing have different loading and
 * error lifecycles, and the server's message on a rejected create (duplicate
 * email, weak password) is what the operator needs to see.
 */
export const useCreatePlatformUser = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createUser = useCallback(
    async (tenantId: string, input: CreatePlatformUserInput): Promise<PlatformUser | null> => {
      setIsSubmitting(true);
      setError(null);
      try {
        return await dashboardService.createPlatformUser(tenantId, input);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Could not create the account.');
        return null;
      } finally {
        setIsSubmitting(false);
      }
    },
    []
  );

  return {
    createUser,
    isSubmitting,
    error,
    clearError: useCallback(() => setError(null), []),
  };
};

/**
 * Appointing another platform administrator.
 *
 * Separate from `useCreatePlatformUser` rather than a role flag on it, because
 * the two post to different endpoints for a structural reason: that one creates
 * an account inside a chosen workspace, and a platform admin belongs to none.
 */
export const useCreatePlatformAdmin = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createAdmin = useCallback(
    async (input: CreatePlatformAdminInput): Promise<PlatformUser | null> => {
      setIsSubmitting(true);
      setError(null);
      try {
        return await dashboardService.createPlatformAdmin(input);
      } catch (err: any) {
        // The server's own message matters here — "already in use by an account
        // on this platform" is the one rejection an operator can act on.
        setError(err.response?.data?.error || 'Could not create the platform administrator.');
        return null;
      } finally {
        setIsSubmitting(false);
      }
    },
    []
  );

  return {
    createAdmin,
    isSubmitting,
    error,
    clearError: useCallback(() => setError(null), []),
  };
};

/**
 * Closing your own platform admin account.
 *
 * `isLastAdmin` is resolved by counting the platform's admins rather than
 * trusting a flag, and is only ever advisory: the server re-checks and answers
 * 409 `LAST_PLATFORM_ADMIN` regardless. It exists so the console can explain
 * WHY the action is unavailable instead of failing after the fact.
 */
export const useOwnPlatformAdminAccount = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otherAdmins, setOtherAdmins] = useState<number | null>(null);

  const refreshAdminCount = useCallback(async (selfId: string | undefined) => {
    try {
      const { items } = await dashboardService.getPlatformUsers({
        role: 'SUPER_ADMIN',
        isActive: true,
        take: 100,
      });
      // "Other" — the caller does not keep the platform running for themselves.
      setOtherAdmins(items.filter((u) => u.id !== selfId).length);
    } catch {
      // Left null: unknown is not zero, and the control stays cautious rather
      // than claiming the account cannot be closed.
      setOtherAdmins(null);
    }
  }, []);

  const closeOwnAccount = useCallback(async (confirmEmail: string): Promise<boolean> => {
    setIsSubmitting(true);
    setError(null);
    try {
      await dashboardService.deleteOwnPlatformAdmin(confirmEmail);
      return true;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not close the account.');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  return {
    closeOwnAccount,
    refreshAdminCount,
    otherAdmins,
    isSubmitting,
    error,
    clearError: useCallback(() => setError(null), []),
  };
};

/**
 * Inviting someone into a workspace from the console, by default as a Business
 * Owner.
 *
 * Same shape as `useCreatePlatformUser` above and deliberately not folded into
 * it: the two write different things (an invitation versus an account) and
 * fail for different reasons the operator has to read — "already has an
 * account here" and "an invitation is already pending" both come back as the
 * server's own message.
 */
export const useInvitePlatformUser = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inviteUser = useCallback(
    async (tenantId: string, input: InvitePlatformUserInput): Promise<boolean> => {
      setIsSubmitting(true);
      setError(null);
      try {
        await dashboardService.invitePlatformUser(tenantId, input);
        return true;
      } catch (err: any) {
        setError(err.response?.data?.error || 'Could not send the invitation.');
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    []
  );

  return {
    inviteUser,
    isSubmitting,
    error,
    clearError: useCallback(() => setError(null), []),
  };
};
