import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useDashboardMetrics, useActivityFeed, useTenants, useUserAdmin } from './useDashboard';
import { useInvitePlatformUser } from './usePlatformUsers';
import { server } from '../setupTests';
import { http, HttpResponse } from 'msw';

// Helper to wrap hooks in a router that provides :tenantSlug param
const createRouterWrapper = (slug: string) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={[`/${slug}`]}>
      <Routes>
        <Route path="/:tenantSlug" element={<>{children}</>} />
      </Routes>
    </MemoryRouter>
  );
  return Wrapper;
};

describe('useDashboard Hooks', () => {
  // ─── useDashboardMetrics ───────────────────────────────────────────
  describe('useDashboardMetrics', () => {
    it('fetches metrics successfully using tenantSlug from route params', async () => {
      server.use(
        http.get('http://localhost:3000/api/acme-corp/dashboard/metrics', () => {
          return HttpResponse.json({
            totalClients: 156,
            totalClientsLastWeek: 140
          });
        })
      );

      const { result } = renderHook(() => useDashboardMetrics(), {
        wrapper: createRouterWrapper('acme-corp'),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.metrics?.totalClients).toBe(156);
      expect(result.current.metrics?.totalClientsLastWeek).toBe(140);
      expect(result.current.error).toBeNull();
    });

    it('handles fetch failure', async () => {
      server.use(
        http.get('http://localhost:3000/api/acme-corp/dashboard/metrics', () => {
          return HttpResponse.json({ error: 'Failed to fetch metrics' }, { status: 500 });
        })
      );

      const { result } = renderHook(() => useDashboardMetrics(), {
        wrapper: createRouterWrapper('acme-corp'),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe('Failed to fetch metrics');
    });

    it('does not re-fetch when parent re-renders with the same tenantSlug', async () => {
      let fetchCount = 0;
      server.use(
        http.get('http://localhost:3000/api/acme-corp/dashboard/metrics', () => {
          fetchCount++;
          return HttpResponse.json({ totalClients: 10, totalClientsLastWeek: 8 });
        })
      );

      const { result, rerender } = renderHook(() => useDashboardMetrics(), {
        wrapper: createRouterWrapper('acme-corp'),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(fetchCount).toBe(1);

      // Parent re-renders — tenantSlug hasn't changed, so fetchMetrics
      // (memoized via useCallback([activeTenant])) should be stable.
      rerender();
      rerender();
      rerender();

      expect(fetchCount).toBe(1);
    });
  });

  // ─── useActivityFeed ───────────────────────────────────────────────
  describe('useActivityFeed', () => {
    it('fetches activity feed with correct limit', async () => {
      server.use(
        http.get('http://localhost:3000/api/acme-corp/dashboard/feed', ({ request }) => {
          const url = new URL(request.url);
          const limit = url.searchParams.get('limit');
          if (limit === '5') {
            return HttpResponse.json({
              timeline: [
                {
                  id: 'evt-1',
                  type: 'CLIENT_CREATED',
                  description: 'Client Added',
                  timestamp: '2023-10-24T10:00:00.000Z',
                  actor: { id: 'u1', name: 'User' }
                }
              ]
            });
          }
          return HttpResponse.json({ timeline: [] });
        })
      );

      const { result } = renderHook(() => useActivityFeed(5), {
        wrapper: createRouterWrapper('acme-corp'),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.activities.length).toBe(1);
      expect(result.current.activities[0].id).toBe('evt-1');
      expect(result.current.error).toBeNull();
    });

    it('does not re-fetch when parent re-renders with the same limit and tenantSlug', async () => {
      let fetchCount = 0;
      server.use(
        http.get('http://localhost:3000/api/acme-corp/dashboard/feed', () => {
          fetchCount++;
          return HttpResponse.json({ timeline: [] });
        })
      );

      const { result, rerender } = renderHook(
        ({ limit }) => useActivityFeed(limit),
        {
          initialProps: { limit: 5 },
          wrapper: createRouterWrapper('acme-corp'),
        }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(fetchCount).toBe(1);

      // Parent re-renders with same primitive limit — should NOT re-fetch
      rerender({ limit: 5 });
      rerender({ limit: 5 });
      rerender({ limit: 5 });

      expect(fetchCount).toBe(1);
    });
  });

  // ─── useTenants ────────────────────────────────────────────────────
  describe('useTenants', () => {
    it('fetches paginated tenants successfully', async () => {
      server.use(
        http.get('http://localhost:3000/api/tenants', ({ request }) => {
          const url = new URL(request.url);
          const skip = url.searchParams.get('skip');
          const take = url.searchParams.get('take');

          if (skip === '0' && take === '50') {
            return HttpResponse.json({
              items: [
                { id: 't-1', name: 'Acme Corp', urlSlug: 'acme', createdAt: '2023-10-01T00:00:00.000Z' }
              ],
              total: 1
            });
          }
          return HttpResponse.json({ items: [], total: 0 });
        })
      );

      const { result } = renderHook(() => useTenants(0, 50));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.tenants.length).toBe(1);
      expect(result.current.total).toBe(1);
      expect(result.current.tenants[0].name).toBe('Acme Corp');
      expect(result.current.error).toBeNull();
    });

    it('does not re-fetch when parent re-renders with same skip/take primitives', async () => {
      let fetchCount = 0;
      server.use(
        http.get('http://localhost:3000/api/tenants', () => {
          fetchCount++;
          return HttpResponse.json({ items: [], total: 0 });
        })
      );

      const { result, rerender } = renderHook(
        ({ skip, take }) => useTenants(skip, take),
        { initialProps: { skip: 0, take: 50 } }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(fetchCount).toBe(1);

      // Re-render with same primitives
      rerender({ skip: 0, take: 50 });
      rerender({ skip: 0, take: 50 });

      // Count should still be 1 (useEffect dependencies haven't changed)
      expect(fetchCount).toBe(1);
    });
  });

  // ─── useUserAdmin ──────────────────────────────────────────────────
  describe('useUserAdmin', () => {
    /*
     * Reactivation after a suspension that promoted a stand-in is a
     * three-way choice, and which one the console sends decides whether
     * anyone gets demoted. These assert the wire value, not just that a
     * request went out.
     */
    it.each(['RESTORE', 'KEEP', 'KEEP_BOTH'] as const)(
      'sends ownershipResolution %s verbatim',
      async (resolution) => {
        let received: any = null;
        server.use(
          http.patch('http://localhost:3000/api/tenants/users/u-1/reactivate', async ({ request }) => {
            received = await request.json();
            return HttpResponse.json({ user: { id: 'u-1', isActive: true } });
          })
        );

        const { result } = renderHook(() => useUserAdmin());
        await act(async () => {
          await result.current.reactivateUser('u-1', resolution);
        });

        expect(received).toEqual({ ownershipResolution: resolution });
      }
    );

    it('surfaces the server code when reactivation needs a choice first', async () => {
      server.use(
        http.patch('http://localhost:3000/api/tenants/users/u-1/reactivate', () =>
          HttpResponse.json(
            { error: 'Choose what happens to ownership', code: 'RESTORE_CHOICE_REQUIRED' },
            { status: 409 }
          )
        )
      );

      const { result } = renderHook(() => useUserAdmin());
      await act(async () => {
        await result.current.reactivateUser('u-1');
      });

      expect(result.current.errorCode).toBe('RESTORE_CHOICE_REQUIRED');
    });
  });

  // ─── useInvitePlatformUser ─────────────────────────────────────────
  describe('useInvitePlatformUser', () => {
    it('invites into the chosen workspace and reports success', async () => {
      let received: any = null;
      server.use(
        http.post('http://localhost:3000/api/tenants/t-1/invitations', async ({ request }) => {
          received = await request.json();
          return HttpResponse.json(
            { invitation: { email: 'new@owner.com', role: 'BUSINESS_OWNER' } },
            { status: 201 }
          );
        })
      );

      const { result } = renderHook(() => useInvitePlatformUser());
      let sent = false;
      await act(async () => {
        sent = await result.current.inviteUser('t-1', {
          email: 'new@owner.com',
          role: 'BUSINESS_OWNER',
        });
      });

      expect(sent).toBe(true);
      expect(received).toEqual({ email: 'new@owner.com', role: 'BUSINESS_OWNER' });
      expect(result.current.error).toBeNull();
    });

    // "Already has an account here" is the operator's cue to promote instead
    // of invite, so the server's own wording has to reach them.
    it('surfaces the server message when the invitee is already in the workspace', async () => {
      server.use(
        http.post('http://localhost:3000/api/tenants/t-1/invitations', () =>
          HttpResponse.json(
            { error: '"taken@owner.com" already has an account in this workspace', code: 'USER_ALREADY_IN_WORKSPACE' },
            { status: 409 }
          )
        )
      );

      const { result } = renderHook(() => useInvitePlatformUser());
      let sent = true;
      await act(async () => {
        sent = await result.current.inviteUser('t-1', {
          email: 'taken@owner.com',
          role: 'BUSINESS_OWNER',
        });
      });

      expect(sent).toBe(false);
      expect(result.current.error).toContain('already has an account');
    });
  });
});
