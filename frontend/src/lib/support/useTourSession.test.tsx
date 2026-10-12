import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useNavigate } from 'react-router-dom';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import SupportHost from '../../components/support/SupportHost';
import i18n from '../../i18n';
import { mockRect } from '../../mocks/mockRect';
import { useAuthStore } from '../../store/useAuthStore';
import { useSupportStore } from '../../store/useSupportStore';
import { useAnnouncerStore } from './announcer';
import { loaders } from './pageRegistry';
import { progressUserKey, readPageProgress } from './progressStorage';
import type { PageGuide } from './types';

const PAGE = 'clients.list';
const NAMESPACE = 'supportSales';

const guide = (over: Partial<PageGuide['steps'][number]>[] = [{}, {}, {}]): PageGuide => ({
  pageId: PAGE,
  version: 1,
  namespace: NAMESPACE,
  steps: ['a', 'b', 'c'].map((id, i) => ({ id, target: `fx.${id}`, kind: 'control' as const, ...over[i] })),
});

const user = { userId: 'u1', email: 'a@b.c', role: 'STAFF' as const, tenantId: 't1', tenantSlug: 'acme' };
const USER_KEY = progressUserKey(user);

let main: HTMLElement;
const created: HTMLElement[] = [];

const addTarget = (id: string, rect = { top: 100, left: 100, width: 120, height: 32 }, parent: HTMLElement = main) => {
  const node = document.createElement('button');
  node.setAttribute('data-tour', `fx.${id}`);
  parent.append(node);
  return mockRect(node, rect);
};

const settle = () =>
  act(async () => {
    for (let i = 0; i < 3; i += 1) await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  });

const NavigateButton = () => {
  const navigate = useNavigate();
  return <button type="button" aria-label="go elsewhere" onClick={() => navigate('/acme/follow-ups')} />;
};

const mount = () =>
  render(
    <MemoryRouter initialEntries={['/acme/clients']}>
      <NavigateButton />
      <SupportHost />
    </MemoryRouter>,
  );

const start = async () => {
  act(() => useSupportStore.getState().startTour(PAGE));
  await screen.findByRole('dialog');
  await settle();
};

const heading = () => screen.getByRole('heading', { level: 2 }).textContent;
const click = (name: string) => act(() => void fireEvent.click(screen.getByRole('button', { name })));
const status = () => screen.getByRole('status').textContent ?? '';
const ring = () => document.body.querySelector('[data-spotlight="ring"]') as HTMLElement | null;

beforeAll(() => {
  i18n.addResourceBundle(
    'en',
    NAMESPACE,
    {
      clients: {
        list: {
          a: { title: 'Alpha', body: 'Alpha body', disabled: 'Alpha is switched off' },
          b: { title: 'Beta', body: 'Beta body' },
          c: { title: 'Gamma', body: 'Gamma body' },
        },
      },
    },
    true,
    true,
  );
});

beforeEach(() => {
  localStorage.clear?.();
  main = document.createElement('main');
  document.body.append(main);
  created.push(main);
  loaders[PAGE] = async () => ({ default: guide() });
  useAuthStore.setState({ user, isAuthenticated: true });
});

afterEach(() => {
  act(() => {
    useSupportStore.getState().endSession();
    useAnnouncerStore.getState().clear();
  });
  created.splice(0).forEach((node) => node.remove());
  delete loaders[PAGE];
  useAuthStore.setState({ user: null, isAuthenticated: false });
  vi.restoreAllMocks();
});

afterAll(() => {
  i18n.removeResourceBundle('en', NAMESPACE);
});

describe('SUP-02 SUP-03 a tour runs from start to completion', () => {
  it('SUP-02 shows the first step with the spotlight on its control', async () => {
    addTarget('a');
    addTarget('b');
    addTarget('c');
    mount();
    await start();
    expect(heading()).toBe('Alpha');
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
    expect(ring()).not.toBeNull();
  });

  it('SUP-03 Next and Back move through the steps, Finish shows the completion card, and Close ends it', async () => {
    ['a', 'b', 'c'].forEach((id) => addTarget(id));
    mount();
    await start();
    click('Next');
    await settle();
    expect(heading()).toBe('Beta');
    click('Back');
    await settle();
    expect(heading()).toBe('Alpha');
    click('Next');
    await settle();
    click('Next');
    await settle();
    expect(heading()).toBe('Gamma');
    click('Finish');
    await settle();
    expect(heading()).toBe("You're done");
    expect(ring()).toBeNull();
    expect(readPageProgress(USER_KEY, PAGE, 1)).toMatchObject({ completedAt: expect.any(String) });
    click('Close');
    await settle();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useSupportStore.getState().mode).toBe('none');
  });

  it('SUP-03 Replay starts the tour again from the first step', async () => {
    ['a', 'b', 'c'].forEach((id) => addTarget(id));
    mount();
    await start();
    click('Next');
    await settle();
    click('Next');
    await settle();
    click('Finish');
    await settle();
    click('Replay');
    await settle();
    expect(heading()).toBe('Alpha');
  });

  it('SUP-03 announces each step by position and title', async () => {
    ['a', 'b', 'c'].forEach((id) => addTarget(id));
    mount();
    await start();
    expect(status()).toBe('Step 1 of 3: Alpha');
    click('Next');
    await settle();
    expect(status()).toBe('Step 2 of 3: Beta');
  });
});

describe('SUP-06 SUP-08 the page changes under a running tour', () => {
  it('SUP-08 skips a step whose control is not on the page, and says so', async () => {
    addTarget('a');
    addTarget('c');
    mount();
    await start();
    click('Next');
    await settle();
    expect(heading()).toBe('Gamma');
    expect(status()).toContain('Skipped: Beta is not available right now');
    expect(status()).toContain('Step 3 of 3: Gamma');
  });

  it('SUP-08 finishes when the last step is the one that is missing', async () => {
    addTarget('a');
    addTarget('b');
    mount();
    await start();
    click('Next');
    await settle();
    click('Finish');
    await settle();
    expect(heading()).toBe("You're done");
  });

  it('SUP-06 shows the lost card when the current control disappears, and restores the step when it returns', async () => {
    const a = addTarget('a');
    addTarget('b');
    mount();
    await start();
    a.remove();
    await settle();
    expect(heading()).toBe('This item changed or is no longer on the page');
    expect(ring()).toBeNull();
    addTarget('a');
    await settle();
    expect(heading()).toBe('Alpha');
    expect(ring()).not.toBeNull();
  });

  it('SUP-06 adds the disabled hint when the current control becomes disabled', async () => {
    const a = addTarget('a');
    addTarget('b');
    mount();
    await start();
    expect(screen.queryByText('Alpha is switched off')).toBeNull();
    a.setAttribute('disabled', '');
    await settle();
    expect(screen.getByText('Alpha is switched off')).toBeInTheDocument();
  });

  it('SUP-06 the spotlight follows a control that is replaced by another node', async () => {
    const a = addTarget('a', { top: 100, left: 100, width: 120, height: 32 });
    addTarget('b');
    mount();
    await start();
    expect(ring()?.style.top).toBe('96px');
    const replacement = addTarget('a', { top: 400, left: 50, width: 80, height: 30 });
    a.remove();
    await settle();
    expect(replacement.isConnected).toBe(true);
    expect(ring()?.style.top).toBe('396px');
    expect(heading()).toBe('Alpha');
  });

  it('SUP-08 waits while a busy region may still render the control, then carries on when it appears', async () => {
    const busy = document.createElement('section');
    busy.setAttribute('aria-busy', 'true');
    main.append(busy);
    mount();
    act(() => useSupportStore.getState().startTour(PAGE));
    await screen.findByRole('dialog');
    await settle();
    expect(heading()).toBe('Loading this part of the page…');
    busy.removeAttribute('aria-busy');
    addTarget('a', undefined, busy);
    await settle();
    expect(heading()).toBe('Alpha');
  });

  it('SUP-08 re-enters the step list when the user’s permissions change mid tour', async () => {
    loaders[PAGE] = async () => ({ default: guide([{}, { requires: { permission: 'fx.view' } }, {}]) });
    ['a', 'b', 'c'].forEach((id) => addTarget(id));
    mount();
    await start();
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument();
    act(() => useAuthStore.getState().updateUser({ permissions: { 'fx.view': 'ALL' }, permissionsVersion: 'v2' }));
    await settle();
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
    expect(heading()).toBe('Alpha');
  });
});

describe('SUP-17 leaving a tour', () => {
  it('SUP-17 Exit keeps the resume point and a restart resumes there', async () => {
    ['a', 'b', 'c'].forEach((id) => addTarget(id));
    mount();
    await start();
    click('Next');
    await settle();
    click('Exit');
    await settle();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(readPageProgress(USER_KEY, PAGE, 1)).toEqual({ v: 1, lastStepId: 'b' });
    await start();
    expect(heading()).toBe('Beta');
  });

  it('SUP-17 Skip tour marks the tour dismissed and forgets the resume point', async () => {
    ['a', 'b', 'c'].forEach((id) => addTarget(id));
    mount();
    await start();
    click('Next');
    await settle();
    click('Skip tour');
    await settle();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(readPageProgress(USER_KEY, PAGE, 1)).toEqual({ v: 1, dismissedAt: expect.any(String) });
    await start();
    expect(heading()).toBe('Alpha');
  });

  it('SUP-17 a tour left by navigating to another page closes cleanly and keeps the resume point', async () => {
    ['a', 'b', 'c'].forEach((id) => addTarget(id));
    mount();
    await start();
    click('Next');
    await settle();
    click('go elsewhere');
    await settle();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(status()).toBe('Tour closed because you moved to another page');
    expect(readPageProgress(USER_KEY, PAGE, 1)).toEqual({ v: 1, lastStepId: 'b' });
    expect(useSupportStore.getState().mode).toBe('none');
  });

  it('SUP-13 Escape exits the tour and puts focus back where it was', async () => {
    ['a', 'b', 'c'].forEach((id) => addTarget(id));
    const launcher = document.createElement('button');
    document.body.append(launcher);
    created.push(launcher);
    launcher.focus();
    mount();
    await start();
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2 }));
    act(() => void fireEvent.keyDown(document.body, { key: 'Escape' }));
    await settle();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(launcher);
  });

  it('SUP-06 the highlighted control is described by the explanation while it is shown', async () => {
    const a = addTarget('a');
    a.setAttribute('aria-describedby', 'existing');
    addTarget('b');
    mount();
    await start();
    const bodyId = screen.getByRole('dialog').getAttribute('aria-describedby');
    expect(a.getAttribute('aria-describedby')).toBe(`existing ${bodyId}`);
    click('Exit');
    await settle();
    expect(a.getAttribute('aria-describedby')).toBe('existing');
  });
});

describe('SUP-19 the tour leaves nothing behind', () => {
  it('SUP-19 after the tour there is no overlay, no attribute residue and no listener left', async () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const a = addTarget('a');
    addTarget('b');
    mount();
    await start();
    click('Exit');
    await settle();
    await act(async () => void (await new Promise((r) => setTimeout(r, 4100))));
    expect(document.body.querySelector('[data-spotlight]')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(a.hasAttribute('aria-describedby')).toBe(false);
    const keydowns = (spy: typeof add) => spy.mock.calls.filter(([type]) => type === 'keydown').length;
    expect(keydowns(remove)).toBe(keydowns(add));
  }, 10000);

  it('SUP-19 a page with no guide ends the session instead of showing an empty card', async () => {
    delete loaders[PAGE];
    mount();
    act(() => useSupportStore.getState().startTour(PAGE));
    await settle();
    await act(async () => void (await new Promise((r) => setTimeout(r, 20))));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useSupportStore.getState().mode).toBe('none');
  });

  it('SUP-17 signing out ends a running tour', async () => {
    ['a', 'b', 'c'].forEach((id) => addTarget(id));
    mount();
    await start();
    act(() => useAuthStore.setState({ user: null, isAuthenticated: false }));
    await settle();
    expect(within(document.body).queryByRole('dialog')).toBeNull();
  });
});
