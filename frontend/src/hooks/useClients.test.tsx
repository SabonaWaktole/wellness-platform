// @ts-nocheck
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { 
  useClients, 
  useClientDetail, 
  useClientHistory, 
  useClientSettings,
  useCreateClient,
  useUpdateClient,
  useDefineCustomField
} from './useClients';
import { server } from '../setupTests';
import { http, HttpResponse } from 'msw';
import { useAuthStore } from '../store/useAuthStore';
import { vi } from 'vitest';

vi.mock('react-router-dom', () => ({
  useParams: () => ({ tenantSlug: 'tenant-1' }),
}));

describe('useClients Hooks', () => {
  beforeEach(() => {
    useAuthStore.setState({ 
      user: { userId: 'staff-1', role: 'STAFF', tenantId: 'tenant-1', tenantSlug: 'tenant-1', email: 'test@example.com' }, 
      isAuthenticated: true 
    });
  });

  describe('useClients', () => {
    it('fetches clients successfully', async () => {
      server.use(
        http.get('http://localhost:3000/api/tenant-1/clients/search', ({ request }) => {
          const url = new URL(request.url);
          const name = url.searchParams.get('name');
          if (name === 'Acme') {
            return HttpResponse.json({
              items: [{ id: 'c1', name: 'Acme Corp', status: 'ACTIVE' }],
              total: 1
            });
          }
          return HttpResponse.json({ items: [], total: 0 });
        })
      );

      const { result } = renderHook(() => useClients());

      await act(async () => {
        await result.current.fetchClients({ name: 'Acme' });
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.clients.length).toBe(1);
      expect(result.current.clients[0].name).toBe('Acme Corp');
      expect(result.current.total).toBe(1);
      expect(result.current.error).toBeNull();
    });

    it('handles fetch failure', async () => {
      server.use(
        http.get('http://localhost:3000/api/tenant-1/clients/search', () => {
          return HttpResponse.json({ error: 'Failed to fetch' }, { status: 500 });
        })
      );

      const { result } = renderHook(() => useClients());

      await act(async () => {
        await result.current.fetchClients();
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe('Failed to fetch');
    });

    it('does not cause redundant fetches when parent re-renders with stable dependencies', async () => {
      let fetchCount = 0;
      server.use(
        http.get('http://localhost:3000/api/tenant-1/clients/search', () => {
          fetchCount++;
          return HttpResponse.json({ items: [], total: 0 });
        })
      );

      const { result, rerender } = renderHook(() => useClients());

      await act(async () => {
        await result.current.fetchClients({ status: 'ACTIVE' });
      });
      
      expect(fetchCount).toBe(1);

      // Simulate parent re-rendering
      rerender();
      rerender();

      // Ensure no additional implicit fetches were triggered by re-renders
      expect(fetchCount).toBe(1);
    });
  });

  describe('useClientDetail', () => {
    it('fetches client detail successfully', async () => {
      server.use(
        http.get('http://localhost:3000/api/tenant-1/clients/c1', () => {
          return HttpResponse.json({ id: 'c1', name: 'Acme Corp' });
        })
      );

      const { result } = renderHook(() => useClientDetail('c1'));

      await act(async () => {
        await result.current.fetchClient();
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.client?.id).toBe('c1');
    });

    it('handles fetch failure', async () => {
      server.use(
        http.get('http://localhost:3000/api/tenant-1/clients/c1', () => {
          return HttpResponse.json({ error: 'Not Found' }, { status: 404 });
        })
      );

      const { result } = renderHook(() => useClientDetail('c1'));

      await act(async () => {
        await result.current.fetchClient();
      });

      expect(result.current.error).toBe('Not Found');
    });
  });

  describe('useClientHistory', () => {
    const entry = (id: string, category = 'NOTE') => ({
      id, category, type: 'INTERACTION_ADDED', timestamp: '2026-01-01T00:00:00.000Z', actor: null, details: {},
    });

    it('FR-CMP-05 fetches the first page', async () => {
      server.use(
        http.get('http://localhost:3000/api/tenant-1/clients/c1/history', () =>
          HttpResponse.json({ timeline: [entry('a')], nextCursor: null })
        )
      );

      const { result } = renderHook(() => useClientHistory('c1'));
      await act(async () => {
        await result.current.fetchHistory();
      });

      expect(result.current.history?.timeline.map((e) => e.id)).toEqual(['a']);
    });

    it('FR-CMP-05 sends the chosen types and appends the next page by cursor', async () => {
      const requests: URLSearchParams[] = [];
      server.use(
        http.get('http://localhost:3000/api/tenant-1/clients/c1/history', ({ request }) => {
          const params = new URL(request.url).searchParams;
          requests.push(params);
          return params.get('cursor')
            ? HttpResponse.json({ timeline: [entry('c', 'CONTRACT')], nextCursor: null })
            : HttpResponse.json({ timeline: [entry('b', 'CONTRACT')], nextCursor: 'next-1' });
        })
      );

      const { result } = renderHook(() => useClientHistory('c1'));
      act(() => result.current.setTypes(['CONTRACT', 'NOTE']));
      await act(async () => {
        await result.current.fetchHistory();
      });
      await act(async () => {
        await result.current.loadMore();
      });

      expect(requests[0].get('type')).toBe('CONTRACT,NOTE');
      expect(requests[1].get('cursor')).toBe('next-1');
      expect(requests[1].get('type')).toBe('CONTRACT,NOTE');
      expect(result.current.history?.timeline.map((e) => e.id)).toEqual(['b', 'c']);
      expect(result.current.history?.nextCursor).toBeNull();
    });
  });

  describe('useClientSettings', () => {
    it('fetches settings successfully', async () => {
      server.use(
        http.get('http://localhost:3000/api/tenant-1/clients/settings/custom-fields', () => {
          return HttpResponse.json([{ id: 'cf1', fieldName: 'Industry' }]);
        })
      );

      const { result } = renderHook(() => useClientSettings());

      await act(async () => {
        await result.current.fetchSettings();
      });

      expect(result.current.customFields.length).toBe(1);
      expect(result.current.error).toBeNull();
    });
  });

  describe('useCreateClient', () => {
    it('creates client successfully', async () => {
      server.use(
        http.post('http://localhost:3000/api/tenant-1/clients', () => {
          return HttpResponse.json({ id: 'new-c1', name: 'New Corp' });
        })
      );

      const { result } = renderHook(() => useCreateClient());

      let res: any;
      await act(async () => {
        res = await result.current.createClient({ name: 'New Corp' });
      });

      expect(res.id).toBe('new-c1');
      expect(result.current.error).toBeNull();
    });

    it('handles create failure', async () => {
      server.use(
        http.post('http://localhost:3000/api/tenant-1/clients', () => {
          return HttpResponse.json({ error: 'Duplicate client' }, { status: 409 });
        })
      );

      const { result } = renderHook(() => useCreateClient());

      let caughtError;
      await act(async () => {
        try {
          await result.current.createClient({ name: 'New Corp' });
        } catch (e) {
          caughtError = e;
        }
      });
      
      expect(caughtError).toBeDefined();
      expect(result.current.error).toBe('Duplicate client');
    });
  });

  describe('useUpdateClient', () => {
    it('updates client successfully', async () => {
      server.use(
        http.put('http://localhost:3000/api/tenant-1/clients/c1', () => {
          return HttpResponse.json({ message: 'Success' });
        })
      );

      const { result } = renderHook(() => useUpdateClient());

      let res: any;
      await act(async () => {
        res = await result.current.updateClient('c1', { name: 'Updated' });
      });

      expect(res.message).toBe('Success');
    });

    it('handles update failure', async () => {
      server.use(
        http.put('http://localhost:3000/api/tenant-1/clients/c1', () => {
          return HttpResponse.json({ error: 'Update failed' }, { status: 400 });
        })
      );

      const { result } = renderHook(() => useUpdateClient());

      let caughtError;
      await act(async () => {
        try {
          await result.current.updateClient('c1', { name: 'Updated' });
        } catch (e) {
          caughtError = e;
        }
      });
      
      expect(caughtError).toBeDefined();
      expect(result.current.error).toBe('Update failed');
    });
  });

  describe('useDefineCustomField', () => {
    it('defines custom field successfully', async () => {
      server.use(
        http.post('http://localhost:3000/api/tenant-1/clients/settings/custom-fields', () => {
          return HttpResponse.json({ id: 'cf1' });
        })
      );

      const { result } = renderHook(() => useDefineCustomField());

      await act(async () => {
        await result.current.defineCustomField({ fieldName: 'Test', fieldType: 'TEXT' });
      });

      expect(result.current.error).toBeNull();
    });

    it('handles define custom field failure', async () => {
      server.use(
        http.post('http://localhost:3000/api/tenant-1/clients/settings/custom-fields', () => {
          return HttpResponse.json({ error: 'Already exists' }, { status: 409 });
        })
      );

      const { result } = renderHook(() => useDefineCustomField());

      let caughtError;
      await act(async () => {
        try {
          await result.current.defineCustomField({ fieldName: 'Test', fieldType: 'TEXT' });
        } catch (e) {
          caughtError = e;
        }
      });

      expect(caughtError).toBeDefined();
      expect(result.current.error).toBe('Already exists');
    });

    // Request-validation failures come back as a raw ZodError (`{ issues: [] }`),
    // not `{ error }`. The hook used to read only `.error`, so these fell
    // through to the generic fallback and the user learned nothing about what
    // was wrong — which is how an invalid field type failed silently.
    it('surfaces zod validation issues from a 400 rather than a generic message', async () => {
      server.use(
        http.post('http://localhost:3000/api/tenant-1/clients/settings/custom-fields', () => {
          return HttpResponse.json(
            {
              issues: [
                { path: ['fieldType'], message: 'Invalid enum value. Expected TEXT | NUMBER | DATE | BOOLEAN | SINGLE_SELECT' },
              ],
            },
            { status: 400 }
          );
        })
      );

      const { result } = renderHook(() => useDefineCustomField());

      await act(async () => {
        try {
          await result.current.defineCustomField({ fieldName: 'Test', fieldType: 'NOPE' });
        } catch {
          /* expected */
        }
      });

      expect(result.current.error).toContain('fieldType');
      expect(result.current.error).toContain('Invalid enum value');
      expect(result.current.error).not.toBe('Failed to define custom field');
    });

    it('accepts BOOLEAN, the type the settings dropdown offers', async () => {
      let received: any = null;
      server.use(
        http.post('http://localhost:3000/api/tenant-1/clients/settings/custom-fields', async ({ request }) => {
          received = await request.json();
          return HttpResponse.json({ id: 'cf-bool' });
        })
      );

      const { result } = renderHook(() => useDefineCustomField());

      await act(async () => {
        await result.current.defineCustomField({ fieldName: 'isVip', fieldType: 'BOOLEAN' });
      });

      expect(received.fieldType).toBe('BOOLEAN');
      expect(result.current.error).toBeNull();
    });

    it('falls back to a generic message when the response has no usable shape', async () => {
      server.use(
        http.post('http://localhost:3000/api/tenant-1/clients/settings/custom-fields', () => {
          return HttpResponse.json({}, { status: 500 });
        })
      );

      const { result } = renderHook(() => useDefineCustomField());

      await act(async () => {
        try {
          await result.current.defineCustomField({ fieldName: 'Test', fieldType: 'TEXT' });
        } catch {
          /* expected */
        }
      });

      expect(result.current.error).toBe('Failed to define custom field');
    });
  });

});
