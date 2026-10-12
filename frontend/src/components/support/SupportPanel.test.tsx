import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loaders } from '../../lib/support/pageRegistry';
import { progressUserKey, writeProgress } from '../../lib/support/progressStorage';
import type { PageGuide } from '../../lib/support/types';
import { useAuthStore, type User } from '../../store/useAuthStore';
import { useSupportStore } from '../../store/useSupportStore';
import { SupportLauncher } from './SupportLauncher';

const user: User = { userId: 'u1', email: 'a@b.c', role: 'STAFF', tenantId: 't1', tenantSlug: 'acme' };
const USER_KEY = progressUserKey(user);

const guide = (steps: PageGuide['steps'] = ['a', 'b', 'c'].map((id) => ({ id, target: `fx.${id}`, kind: 'control' as const }))): PageGuide => ({
  pageId: 'clients.list',
  version: 1,
  namespace: 'supportSales',
  steps,
});

/** An in-memory Storage: under Node 26, Node's own `localStorage` global shadows jsdom's and is unusable without a file. */
const memoryStorage = (): Storage => {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  };
};

const GoElsewhere = () => {
  const navigate = useNavigate();
  return <button type="button" aria-label="go elsewhere" onClick={() => navigate('/acme/follow-ups')} />;
};

const mount = (path = '/acme/clients') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <GoElsewhere />
      <SupportLauncher />
    </MemoryRouter>,
  );

const open = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Help' }));
  return screen.findByRole('dialog');
};
const launcher = () => screen.getByRole('button', { name: 'Help' });

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  useAuthStore.setState({ user, isAuthenticated: true });
  loaders['clients.list'] = async () => ({ default: guide() });
});

afterEach(() => {
  act(() => {
    useSupportStore.getState().closePanel();
    useSupportStore.getState().endSession();
    useSupportStore.getState().clearContext();
  });
  delete loaders['clients.list'];
  useAuthStore.setState({ user: null, isAuthenticated: false });
  vi.unstubAllGlobals();
});

describe('SUP-01 SupportPanel: what it offers on this page', () => {
  it('SUP-01 names the page it resolved and offers the tour', async () => {
    mount();
    const dialog = await open();
    expect(await screen.findByRole('button', { name: 'Tour this page' })).toBeInTheDocument();
    expect(dialog).toHaveAccessibleName('Help for Clients list');
  });

  it('SUP-01 says so honestly for a page whose guide is not written yet', async () => {
    delete loaders['clients.list'];
    mount();
    await open();
    expect(await screen.findByText('No help written for Clients list yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /tour/i })).toBeNull();
  });

  it('SUP-01 says so for a route that has no page at all', async () => {
    mount('/acme');
    await open();
    expect(await screen.findByText('No help for this screen yet')).toBeInTheDocument();
  });

  it('SUP-09 treats a guide with no steps this user may see as no guide', async () => {
    loaders['clients.list'] = async () => ({
      default: guide([{ id: 'a', target: 'fx.a', kind: 'control', requires: { permission: 'nobody.has' } }]),
    });
    mount();
    await open();
    expect(await screen.findByText('No help written for Clients list yet')).toBeInTheDocument();
  });

  it('SUP-01 offers "Tour this tab" on a page whose tab the page published', async () => {
    act(() => useSupportStore.getState().setContext({ scope: 'zones' }));
    mount('/acme/clients');
    await open();
    expect(await screen.findByRole('button', { name: 'Tour this tab' })).toBeInTheDocument();
  });

  it('SUP-01 follows the tab when it changes while the panel is open', async () => {
    mount();
    await open();
    await screen.findByRole('button', { name: 'Tour this page' });
    act(() => useSupportStore.getState().setContext({ scope: 'zones' }));
    expect(await screen.findByRole('button', { name: 'Tour this tab' })).toBeInTheDocument();
  });

  it('SUP-01 shows a loading state for the instant the guide takes, then the actions', async () => {
    let release: (g: { default: PageGuide }) => void = () => {};
    loaders['clients.list'] = () => new Promise((resolve) => (release = resolve));
    mount();
    const dialog = await open();
    expect(dialog).toHaveAttribute('aria-busy', 'true');
    await act(async () => release({ default: guide() }));
    expect(await screen.findByRole('button', { name: 'Tour this page' })).toBeInTheDocument();
  });

  it('SUP-01 reports a guide that fails to load, and Retry tries again', async () => {
    let attempts = 0;
    loaders['clients.list'] = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('chunk failed');
      return { default: guide() };
    };
    mount();
    await open();
    expect(await screen.findByText('Help could not be loaded.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('button', { name: 'Tour this page' })).toBeInTheDocument();
    expect(attempts).toBe(2);
  });
});

describe('SUP-17 SupportPanel: progress', () => {
  it('SUP-17 offers Resume with the step it would resume at', async () => {
    writeProgress(USER_KEY, 'clients.list', { v: 1, lastStepId: 'b' });
    mount();
    await open();
    expect(await screen.findByRole('button', { name: 'Resume tour (step 2 of 3)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start over' })).toBeInTheDocument();
  });

  it('SUP-17 offers Replay, with a completed mark, after the tour was finished', async () => {
    writeProgress(USER_KEY, 'clients.list', { v: 1, completedAt: '2026-10-12T10:00:00.000Z' });
    mount();
    await open();
    expect(await screen.findByRole('button', { name: 'Replay tour' })).toBeInTheDocument();
    expect(screen.getByText("You've completed this tour.")).toBeInTheDocument();
  });

  it('SUP-17 offers the plain tour again after Skip tour', async () => {
    writeProgress(USER_KEY, 'clients.list', { v: 1, dismissedAt: '2026-10-12T10:00:00.000Z' });
    mount();
    await open();
    expect(await screen.findByRole('button', { name: 'Tour this page' })).toBeInTheDocument();
  });

  it('SUP-17 ignores progress written for an older version of the guide', async () => {
    writeProgress(USER_KEY, 'clients.list', { v: 0, completedAt: 'x' });
    mount();
    await open();
    expect(await screen.findByRole('button', { name: 'Tour this page' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Replay tour' })).toBeNull();
  });
});

describe('SUP-03 SupportPanel: starting', () => {
  it('SUP-03 Tour this page starts the tour for the page and closes the panel', async () => {
    mount();
    await open();
    fireEvent.click(await screen.findByRole('button', { name: 'Tour this page' }));
    expect(useSupportStore.getState()).toMatchObject({ mode: 'tour', panelOpen: false, context: { pageId: 'clients.list' } });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('SUP-17 Start over forgets the resume point before starting', async () => {
    writeProgress(USER_KEY, 'clients.list', { v: 1, lastStepId: 'b' });
    mount();
    await open();
    fireEvent.click(await screen.findByRole('button', { name: 'Start over' }));
    expect(useSupportStore.getState().mode).toBe('tour');
    expect(JSON.parse(localStorage.getItem('wellness-support-progress') as string)[USER_KEY]['clients.list']).toEqual({ v: 1 });
  });
});

describe('SUP-13 SUP-14 SupportPanel: closing', () => {
  it('SUP-13 Escape closes it and focus returns to the launcher', async () => {
    mount();
    await open();
    await screen.findByRole('button', { name: 'Tour this page' });
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(launcher());
  });

  it('SUP-13 Escape works while the panel is still loading', async () => {
    mount();
    await open();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(launcher());
  });

  it('SUP-13 Close closes it and focus returns to the launcher', async () => {
    mount();
    await open();
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(launcher());
  });

  it('SUP-13 a click outside closes it', async () => {
    mount();
    await open();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('SUP-13 a click inside does not', async () => {
    const dialog = await (async () => {
      mount();
      return open();
    })();
    fireEvent.mouseDown(dialog);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('SUP-01 navigating to another page closes it', async () => {
    mount();
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'go elsewhere' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useSupportStore.getState().panelOpen).toBe(false);
  });

  it('SUP-01 a panel left open on the previous page does not reappear on the next one', async () => {
    act(() => {
      useSupportStore.getState().openPanel();
      useSupportStore.getState().setPanelPath('/acme/clients');
    });
    mount('/acme/follow-ups');
    await act(async () => void (await new Promise((r) => setTimeout(r, 20))));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useSupportStore.getState().panelOpen).toBe(false);
  });

  it('SUP-14 moves focus into the panel when it opens', async () => {
    mount();
    const dialog = await open();
    await screen.findByRole('button', { name: 'Tour this page' });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('SUP-19 removes its listeners when closed', async () => {
    const remove = vi.spyOn(document, 'removeEventListener');
    mount();
    await open();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    const types = remove.mock.calls.map(([type]) => type);
    expect(types).toContain('keydown');
    expect(types).toContain('mousedown');
  });
});
