import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppLayout } from '../../../components/layout/AppLayout/AppLayout';
import { Sidebar, type NavItem } from '../../../components/layout/Sidebar/Sidebar';
import SupportHost from '../../../components/support/SupportHost';
import { mockRect } from '../../../mocks/mockRect';
import { useAuthStore, type User } from '../../../store/useAuthStore';
import { useSupportStore } from '../../../store/useSupportStore';
import { useAnnouncerStore } from '../announcer';
import { definePageGuide } from '../defineGuide';
import { assertGuideIntegrity, lintGuide } from '../guideLint';
import { loaders } from '../pageRegistry';
import { isStepEligible } from '../stepEligibility';
import { includeShell, shellGuide, shellSteps } from './shell';

const NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', isActive: true },
  { id: 'clients', label: 'Clients', icon: 'group' },
  { id: 'deals', label: 'Deals', icon: 'pipeline' },
];

const user = (permissions: User['permissions']): User => ({
  userId: 'u1',
  email: 'a@b.c',
  role: 'STAFF',
  tenantId: 't1',
  tenantSlug: 'acme',
  permissions,
});

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

const stubViewport = (desktop: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('min-width: 768px') ? desktop : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));

const shell = (withHost = false) =>
  render(
    <MemoryRouter initialEntries={['/acme/clients']}>
      <AppLayout userName="Ana Hoxha" onLogout={() => {}} onSettingsClick={() => {}} sidebar={<Sidebar navItems={NAV} onNavItemClick={() => {}} onLogoutClick={() => {}} />}>
        <p>{'page'}</p>
      </AppLayout>
      {withHost && <SupportHost />}
    </MemoryRouter>,
  );

const all = (token: string) => Array.from(document.querySelectorAll(`[data-tour~="${token}"]`));
const settle = () => act(async () => void (await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))));

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  stubViewport(true);
  useAuthStore.setState({ user: user({ 'script.view': 'ALL' }), isAuthenticated: true });
});

afterEach(() => {
  act(() => {
    useSupportStore.getState().endSession();
    useSupportStore.getState().closePanel();
    useAnnouncerStore.getState().clear();
  });
  delete loaders['clients.list'];
  useAuthStore.setState({ user: null, isAuthenticated: false });
  vi.unstubAllGlobals();
});

describe('SUP-05 the shell controls are annotated', () => {
  it.each([
    'shell.menu',
    'shell.nav',
    'shell.org',
    'shell.theme',
    'shell.notifications',
    'shell.script',
    'shell.support',
    'shell.support.nav',
    'shell.profile',
    'shell.logout',
  ])('SUP-05 %s exists exactly once in the rendered layout and sidebar', (token) => {
    shell();
    expect(all(token)).toHaveLength(1);
  });

  it('SUP-05 puts each id on the real control, not a wrapper', () => {
    shell();
    expect(all('shell.menu')[0].tagName).toBe('BUTTON');
    expect(all('shell.notifications')[0].tagName).toBe('BUTTON');
    expect(all('shell.script')[0].tagName).toBe('BUTTON');
    expect(all('shell.support')[0]).toBe(screen.getByRole('button', { name: 'Help' }));
    expect(all('shell.profile')[0]).toBe(screen.getByRole('button', { name: 'User Profile' }));
    expect(all('shell.theme')[0].tagName).toBe('BUTTON');
    expect(all('shell.nav')[0].tagName).toBe('NAV');
    expect(all('shell.logout')[0].tagName).toBe('A');
  });

  it('SUP-07 marks every navigation item with one repeated id, one per rendered item', () => {
    shell();
    const items = all('shell.nav.item');
    expect(items).toHaveLength(NAV.length);
    expect(items.every((node) => node.tagName === 'A' && node.hasAttribute('data-tour-repeat'))).toBe(true);
  });

  it('SUP-09 a user without the sales script permission has no script control to point at', () => {
    useAuthStore.setState({ user: user({}), isAuthenticated: true });
    shell();
    expect(all('shell.script')).toHaveLength(0);
  });

  it('SUP-05 does not annotate the two inert controls: the header search and the sidebar "New entry" button', () => {
    shell();
    for (const input of document.querySelectorAll('input')) expect(input.closest('[data-tour]')).toBeNull();
    // The sidebar as a whole is the nav region; the button itself, and the block that holds it, carry no id.
    const newEntry = screen.getByRole('button', { name: /new entry/i });
    expect(newEntry).not.toHaveAttribute('data-tour');
    expect(newEntry.parentElement).not.toHaveAttribute('data-tour');
  });

  it('SUP-05 does not annotate the mobile search toggle either (it drives the inert search)', () => {
    shell();
    expect(screen.getByRole('button', { name: 'Search' }).closest('[data-tour]')).toBeNull();
  });
});

describe('SUP-02 the shell guide', () => {
  it('SUP-02 is a sound guide with every step in English and Albanian', () => {
    expect(() => assertGuideIntegrity(shellGuide)).not.toThrow();
  });

  it('SUP-02 explains nine controls in tour order', () => {
    expect(shellSteps.map((s) => s.id)).toEqual([
      'shellMenu', 'shellNav', 'shellNavItem', 'shellTheme', 'shellNotifications', 'shellScript', 'shellSupport', 'shellProfile', 'shellLogout',
    ]);
  });

  it('SUP-12 explains every shell control and operates none', () => {
    expect(shellSteps.every((s) => (s.safety ?? 'explain-only') === 'explain-only')).toBe(true);
  });

  it('SUP-05 looks for every shell step in the whole page, not just the main area', () => {
    expect(shellSteps.every((s) => s.scope === 'shell')).toBe(true);
  });

  it('SUP-07 declares the repeated navigation item as repeat', () => {
    expect(shellSteps.find((s) => s.id === 'shellNavItem')).toMatchObject({ repeat: true, target: 'shell.nav.item' });
  });

  it('SUP-15 the menu button is a phone-only step, and the sidebar steps need the sidebar open', () => {
    expect(shellSteps.find((s) => s.id === 'shellMenu')?.requires).toEqual({ viewport: 'mobile' });
    for (const id of ['shellNav', 'shellNavItem', 'shellLogout']) expect(shellSteps.find((s) => s.id === id)?.needs).toBe('sidebar');
  });

  it('SUP-09 the sales script step needs script.view; a user without it has no such step', () => {
    const script = shellSteps.find((s) => s.id === 'shellScript')!;
    expect(isStepEligible(script, { permissions: { 'script.view': 'ALL' } }, 'desktop')).toBe(true);
    expect(isStepEligible(script, { permissions: {} }, 'desktop')).toBe(false);
  });

  it('SUP-05 a page guide can include the shell steps and stay sound', () => {
    const guide = definePageGuide({
      pageId: 'clients.list',
      version: 1,
      namespace: 'supportSales',
      steps: [...includeShell(), { id: 'add', target: 'clients.list.add', kind: 'control' }],
    });
    const issues = lintGuide(guide).filter((i) => !(i.code === 'missing-copy' && i.stepId === 'add'));
    expect(issues).toEqual([]);
  });

  it('SUP-05 included steps are copies, so a page can change them without changing the shell', () => {
    const first = includeShell();
    first[0].safety = 'try-it';
    expect(includeShell()[0].safety).not.toBe('try-it');
  });
});

describe('SUP-15 a step about the navigation on a phone', () => {
  const run = async (desktop: boolean) => {
    stubViewport(desktop);
    loaders['clients.list'] = async () => ({
      default: definePageGuide({ pageId: 'clients.list', version: 1, namespace: 'supportSales', steps: includeShell() }),
    });
    shell(true);
    document.querySelectorAll('[data-tour]').forEach((node) => mockRect(node));
    act(() => useSupportStore.getState().startTour('clients.list'));
    await screen.findByRole('dialog');
    await settle();
  };
  const sidebarOpen = () => /sidebarOpen/.test(document.querySelector('nav')!.className);
  const next = async () => {
    act(() => void fireEvent.click(screen.getByRole('button', { name: /^(Next|Finish)$/ })));
    await settle();
  };
  const heading = () => within(screen.getByRole('dialog')).getByRole('heading', { level: 2 }).textContent;

  it('SUP-15 opens the sidebar for the navigation step, and closes it again when the tour moves on', async () => {
    await run(false);
    expect(screen.getByText('Step 1 of 9')).toBeInTheDocument();
    expect(sidebarOpen()).toBe(false);
    await next();
    expect(heading()).toBe('Main menu');
    expect(sidebarOpen()).toBe(true);
    await next();
    expect(sidebarOpen()).toBe(true);
    await next();
    expect(heading()).toBe('Appearance');
    expect(sidebarOpen()).toBe(false);
  });

  it('SUP-15 leaves the sidebar as it found it when the tour is exited on a navigation step', async () => {
    await run(false);
    await next();
    expect(sidebarOpen()).toBe(true);
    act(() => void fireEvent.click(screen.getByRole('button', { name: 'Exit' })));
    await settle();
    expect(sidebarOpen()).toBe(false);
  });

  it('SUP-15 on a desktop the sidebar is always there, so nothing is opened and the menu button step is gone', async () => {
    await run(true);
    expect(screen.getByText('Step 1 of 8')).toBeInTheDocument();
    expect(heading()).toBe('Main menu');
    expect(sidebarOpen()).toBe(false);
  });
});

describe('SUP-09 the tour follows the permissions the user has', () => {
  it('SUP-09 a user without the sales script permission is not taken through it', async () => {
    useAuthStore.setState({ user: user({}), isAuthenticated: true });
    stubViewport(true);
    loaders['clients.list'] = async () => ({
      default: definePageGuide({ pageId: 'clients.list', version: 1, namespace: 'supportSales', steps: includeShell() }),
    });
    shell(true);
    document.querySelectorAll('[data-tour]').forEach((node) => mockRect(node));
    act(() => useSupportStore.getState().startTour('clients.list'));
    await screen.findByRole('dialog');
    expect(screen.getByText('Step 1 of 7')).toBeInTheDocument();
  });
});
