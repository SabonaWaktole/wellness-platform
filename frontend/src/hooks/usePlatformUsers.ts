import { useCallback, useEffect, useState } from 'react';
import { dashboardService } from '../services/dashboardService';
import type { PlatformUser, PlatformUserFilters, InvitePlatformUserInput } from '../services/dashboardService';

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
 * Inviting someone from the console, by email.
 *
 * A `tenantId` sends them into that workspace, defaulting to Business Owner.
 * `tenantId: null` invites another Platform Admin instead, who belongs to no
 * workspace — the two branch to different endpoints here so the page only
 * ever has one hook to call regardless of which the operator chose.
 */
export const useInvitePlatformUser = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inviteUser = useCallback(
    async (tenantId: string | null, input: InvitePlatformUserInput): Promise<boolean> => {
      setIsSubmitting(true);
      setError(null);
      try {
        if (tenantId) {
          await dashboardService.invitePlatformUser(tenantId, input);
        } else {
          await dashboardService.invitePlatformAdmin({ email: input.email });
        }
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
