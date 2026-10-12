import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockRect } from '../../mocks/mockRect';
import { useAuthStore, type User } from '../../store/useAuthStore';
import { useExplainableControls } from './useExplainableControls';
import type { GuideStep, PageGuide } from './types';

const created: HTMLElement[] = [];
const main = () => {
  let node = document.querySelector('main') as HTMLElement | null;
  if (!node) {
    node = document.createElement('main');
    document.body.append(node);
    created.push(node);
  }
  return node;
};
const add = (token: string, attrs: Record<string, string> = {}, parent: HTMLElement = main()) => {
  const node = document.createElement('button');
  node.setAttribute('data-tour', token);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  parent.append(node);
  return mockRect(node);
};
const settle = () => act(async () => void (await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))));

const guide = (steps: GuideStep[]): PageGuide => ({ pageId: 'clients.list', version: 1, namespace: 'supportSales', steps });
const user: User = { userId: 'u1', email: 'a@b.c', role: 'STAFF', tenantId: 't1', tenantSlug: 'acme', permissions: {} };

beforeEach(() => useAuthStore.setState({ user, isAuthenticated: true }));
afterEach(() => {
  created.splice(0).forEach((n) => n.remove());
  useAuthStore.setState({ user: null, isAuthenticated: false });
  vi.restoreAllMocks();
});

const ids = (entries: Array<{ step: GuideStep }>) => entries.map((e) => e.step.id);

describe('SUP-04 useExplainableControls: what can be explained right now', () => {
  const steps: GuideStep[] = [
    { id: 'add', target: 'fx.add', kind: 'control' },
    { id: 'search', target: 'fx.search', kind: 'field' },
    { id: 'clear', target: 'fx.clear', kind: 'control' },
  ];

  it('SUP-04 lists the steps whose control is on the page, in tour order, and leaves out the rest', () => {
    add('fx.search');
    add('fx.add');
    const { result } = renderHook(() => useExplainableControls(guide(steps)));
    expect(ids(result.current.entries)).toEqual(['add', 'search']);
  });

  it('SUP-04 a control that appears later joins the list, and one that goes leaves it', async () => {
    const search = add('fx.search');
    const { result } = renderHook(() => useExplainableControls(guide(steps)));
    expect(ids(result.current.entries)).toEqual(['search']);
    add('fx.clear');
    await settle();
    expect(ids(result.current.entries)).toEqual(['search', 'clear']);
    search.remove();
    await settle();
    expect(ids(result.current.entries)).toEqual(['clear']);
  });

  it('SUP-04 a disabled control is listed, and says so', () => {
    add('fx.add', { disabled: '' });
    const { result } = renderHook(() => useExplainableControls(guide(steps)));
    expect(result.current.entries[0]).toMatchObject({ step: { id: 'add' }, status: 'disabled' });
  });

  it('SUP-04 no guide, no entries', () => {
    const { result } = renderHook(() => useExplainableControls(null));
    expect(result.current).toMatchObject({ entries: [], loading: false });
  });
});

describe('SUP-07 useExplainableControls: repeated controls', () => {
  it('SUP-07 twenty rows give one entry, flagged as appearing on every row', () => {
    for (let i = 0; i < 20; i += 1) add('fx.row');
    const { result } = renderHook(() => useExplainableControls(guide([{ id: 'rows', target: 'fx.row', kind: 'region', repeat: true }])));
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]).toMatchObject({ step: { id: 'rows' }, repeated: true });
  });

  it('SUP-07 two steps about the same control are one entry', () => {
    add('fx.row');
    const { result } = renderHook(() =>
      useExplainableControls(
        guide([
          { id: 'rows', target: 'fx.row', kind: 'region', repeat: true },
          { id: 'rowsAgain', target: 'fx.row', kind: 'region', repeat: true },
        ]),
      ),
    );
    expect(ids(result.current.entries)).toEqual(['rows']);
  });

  it('SUP-07 a control that is not repeated is not flagged', () => {
    add('fx.add');
    const { result } = renderHook(() => useExplainableControls(guide([{ id: 'add', target: 'fx.add', kind: 'control' }])));
    expect(result.current.entries[0].repeated).toBe(false);
  });
});

describe('SUP-11 useExplainableControls: loading', () => {
  it('SUP-11 says it is loading while the page is busy and nothing is there yet, then fills', async () => {
    const busy = document.createElement('section');
    busy.setAttribute('aria-busy', 'true');
    main().append(busy);
    const { result } = renderHook(() => useExplainableControls(guide([{ id: 'add', target: 'fx.add', kind: 'control' }])));
    expect(result.current).toMatchObject({ loading: true, entries: [] });
    busy.removeAttribute('aria-busy');
    add('fx.add', {}, busy);
    await settle();
    expect(result.current.loading).toBe(false);
    expect(ids(result.current.entries)).toEqual(['add']);
  });

  it('SUP-11 is not loading just because nothing matches on a settled page', () => {
    main();
    const { result } = renderHook(() => useExplainableControls(guide([{ id: 'add', target: 'fx.add', kind: 'control' }])));
    expect(result.current).toMatchObject({ loading: false, entries: [] });
  });

  it('SUP-11 refresh looks again', () => {
    main();
    const { result } = renderHook(() => useExplainableControls(guide([{ id: 'add', target: 'fx.add', kind: 'control' }])));
    const node = document.createElement('button');
    node.setAttribute('data-tour', 'fx.add');
    mockRect(node);
    main().append(node);
    act(() => result.current.refresh());
    expect(ids(result.current.entries)).toEqual(['add']);
  });
});

describe('SUP-09 useExplainableControls: permissions', () => {
  const gated: GuideStep[] = [{ id: 'del', target: 'fx.del', kind: 'control', requires: { permission: 'companies.delete' } }];

  it('SUP-09 leaves out a control the user may not use, even if it is on the page', () => {
    add('fx.del');
    const { result } = renderHook(() => useExplainableControls(guide(gated)));
    expect(result.current.entries).toEqual([]);
  });

  it('SUP-09 lists it for a user who may', () => {
    useAuthStore.setState({ user: { ...user, permissions: { 'companies.delete': 'ALL' } } });
    add('fx.del');
    const { result } = renderHook(() => useExplainableControls(guide(gated)));
    expect(ids(result.current.entries)).toEqual(['del']);
  });
});

describe('SUP-04 useExplainableControls: sections', () => {
  it('SUP-04 carries each control’s section, empty when it has none', () => {
    add('fx.a');
    add('fx.b');
    const { result } = renderHook(() =>
      useExplainableControls(
        guide([
          { id: 'a', target: 'fx.a', kind: 'control', section: 'Filters' },
          { id: 'b', target: 'fx.b', kind: 'control' },
        ]),
      ),
    );
    expect(result.current.entries.map((e) => e.section)).toEqual(['Filters', '']);
  });
});
