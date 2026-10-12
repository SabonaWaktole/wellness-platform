import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore, type User } from '../../store/useAuthStore';
import { useEligibleSteps } from './stepEligibility';
import type { PageGuide } from './types';

const base: User = { userId: 'u1', email: 'a@b.c', role: 'STAFF', tenantId: 't1', tenantSlug: 'acme' };

const guide: PageGuide = {
  pageId: 'deals.detail',
  version: 1,
  namespace: 'supportSales',
  steps: [
    { id: 'title', target: 'deals.detail.title', kind: 'region' },
    { id: 'edit', target: 'deals.detail.edit', kind: 'control', requires: { permission: 'deals.edit' } },
    { id: 'quote', target: 'deals.detail.quote', kind: 'control', requires: { workflow: 'LEGACY_QUOTATIONS' } },
    { id: 'rail', target: 'deals.detail.rail', kind: 'region', requires: { viewport: 'desktop' } },
  ],
};

const signIn = (over: Partial<User>) => useAuthStore.setState({ user: { ...base, ...over }, isAuthenticated: true });
const ids = (steps: Array<{ id: string }>) => steps.map((s) => s.id);

const stubViewport = (desktop: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: desktop,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));

describe('SUP-09 useEligibleSteps', () => {
  beforeEach(() => stubViewport(true));
  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.setState({ user: null, impersonating: null, isAuthenticated: false });
  });

  it('SUP-09 keeps only the steps this user may see', () => {
    signIn({ permissions: { 'deals.edit': 'ALL' }, tenantSalesWorkflow: 'SALES_PROCESS' });
    const { result } = renderHook(() => useEligibleSteps(guide));
    expect(ids(result.current)).toEqual(['title', 'edit', 'rail']);
  });

  it('SUP-09 without the permission the step is gone', () => {
    signIn({ permissions: {}, tenantSalesWorkflow: 'SALES_PROCESS' });
    const { result } = renderHook(() => useEligibleSteps(guide));
    expect(ids(result.current)).toEqual(['title', 'rail']);
  });

  it('SUP-09 switching the tenant workflow changes the list on the next render', () => {
    signIn({ permissions: {}, tenantSalesWorkflow: 'SALES_PROCESS' });
    const { result } = renderHook(() => useEligibleSteps(guide));
    expect(ids(result.current)).not.toContain('quote');
    act(() => useAuthStore.getState().updateUser({ tenantSalesWorkflow: 'LEGACY_QUOTATIONS' }));
    expect(ids(result.current)).toContain('quote');
  });

  it('SUP-09 a refreshed permission set re-runs eligibility', () => {
    signIn({ permissions: {}, permissionsVersion: 'v1' });
    const { result } = renderHook(() => useEligibleSteps(guide));
    expect(ids(result.current)).not.toContain('edit');
    act(() => useAuthStore.getState().updateUser({ permissions: { 'deals.edit': 'OWN' }, permissionsVersion: 'v2' }));
    expect(ids(result.current)).toContain('edit');
  });

  it('SUP-09 a phone viewport drops desktop only steps', () => {
    stubViewport(false);
    signIn({ permissions: {} });
    const { result } = renderHook(() => useEligibleSteps(guide));
    expect(ids(result.current)).not.toContain('rail');
  });

  it('SUP-09 no guide means no steps, and the same inputs give the same array', () => {
    signIn({ permissions: {} });
    expect(renderHook(() => useEligibleSteps(null)).result.current).toEqual([]);
    const { result, rerender } = renderHook(() => useEligibleSteps(guide));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
