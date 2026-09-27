import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useInitAuth } from './useInitAuth';
import { useAuthStore } from '../store/useAuthStore';
import { authService } from '../services/authService';

vi.mock('../services/authService', () => ({
  authService: {
    getSession: vi.fn(),
  },
}));

const setPermissionsVersionListener = vi.fn();
vi.mock('../api', () => ({
  setPermissionsVersionListener: (...args: unknown[]) => setPermissionsVersionListener(...args),
}));

const baseUser = {
  userId: '1',
  role: 'STAFF',
  tenantId: 't1',
  tenantSlug: 't1',
  email: 'e',
  permissions: { 'companies.view': 'OWN' as const },
  permissionsVersion: 'v1',
};

/** The `onVersion` callback `useInitAuth` last registered. */
function registeredListener(): (version: string) => void {
  const lastCall = setPermissionsVersionListener.mock.calls.at(-1);
  return lastCall![0];
}

describe('useInitAuth (FR-USR-03)', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, isAuthenticated: false, isInitializing: true, impersonating: null });
    setPermissionsVersionListener.mockClear();
    vi.mocked(authService.getSession).mockResolvedValue({ user: baseUser, impersonating: null });
  });

  it('bootstraps the session from GET /auth/me on mount', async () => {
    renderHook(() => useInitAuth());

    await waitFor(() => expect(useAuthStore.getState().user).toEqual(baseUser));
    expect(useAuthStore.getState().isInitializing).toBe(false);
  });

  it('registers a permissions-version listener and unregisters it on unmount', () => {
    const { unmount } = renderHook(() => useInitAuth());
    expect(setPermissionsVersionListener).toHaveBeenCalledWith(expect.any(Function));

    unmount();
    expect(setPermissionsVersionListener).toHaveBeenLastCalledWith(null);
  });

  it('refetches the session when X-Permissions-Version disagrees with the stored one', async () => {
    renderHook(() => useInitAuth());
    await waitFor(() => expect(useAuthStore.getState().user).toEqual(baseUser));

    const updatedUser = { ...baseUser, permissions: { 'users.manage': true as const }, permissionsVersion: 'v2' };
    vi.mocked(authService.getSession).mockResolvedValue({ user: updatedUser, impersonating: null });

    registeredListener()('v2');

    await waitFor(() => expect(useAuthStore.getState().user?.permissionsVersion).toBe('v2'));
    expect(useAuthStore.getState().user).toEqual(updatedUser);
  });

  it('leaves the session alone when the version matches', async () => {
    renderHook(() => useInitAuth());
    await waitFor(() => expect(useAuthStore.getState().user).toEqual(baseUser));

    vi.mocked(authService.getSession).mockClear();
    registeredListener()('v1');

    // Give any accidental async work a tick to run.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(authService.getSession).not.toHaveBeenCalled();
  });
});
