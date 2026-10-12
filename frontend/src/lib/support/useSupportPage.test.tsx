import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSupportStore } from '../../store/useSupportStore';
import { useSupportPage } from './useSupportPage';

const at = (path: string) => ({ wrapper: ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter> });

describe('SUP-01 useSupportPage', () => {
  beforeEach(() => {
    useSupportStore.getState().clearContext();
  });

  it('SUP-01 names the page from the URL, as a planned page with no guide yet', () => {
    const { result } = renderHook(() => useSupportPage(), at('/acme/clients'));
    expect(result.current).toEqual({ pageId: 'clients.list', scope: null, hasGuide: false, isPlanned: true });
  });

  it('SUP-01 has no page on an excluded route', () => {
    const { result } = renderHook(() => useSupportPage(), at('/login'));
    expect(result.current).toEqual({ pageId: null, scope: null, hasGuide: false, isPlanned: false });
  });

  it('SUP-01 the dashboard gets its id when the page publishes its variant, and loses it when cleared', () => {
    const { result } = renderHook(() => useSupportPage(), at('/acme/dashboard'));
    expect(result.current.pageId).toBeNull();
    act(() => useSupportStore.getState().setContext({ variant: 'ceo' }));
    expect(result.current.pageId).toBe('dashboard.ceo');
    act(() => useSupportStore.getState().clearContext());
    expect(result.current.pageId).toBeNull();
  });

  it('SUP-01 carries the tab a page published', () => {
    const { result } = renderHook(() => useSupportPage(), at('/acme/settings/pricing/zones'));
    act(() => useSupportStore.getState().setContext({ scope: 'zones' }));
    expect(result.current).toMatchObject({ pageId: 'settings.pricing', scope: 'zones' });
  });
});
