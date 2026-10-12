import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import SupportHost from '../../components/support/SupportHost';
import i18n from '../../i18n';
import { makeDomRect, ON_SCREEN } from '../../mocks/mockRect';
import { useAuthStore } from '../../store/useAuthStore';
import { useSupportStore } from '../../store/useSupportStore';
import { useAnnouncerStore } from './announcer';
import { loaders } from './pageRegistry';
import type { GuideStep } from './types';

const memoryStorage = (): Storage => {
  const items = new Map<string, string>();
  return {
    get length() { return items.size; },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  };
};

const steps: GuideStep[] = [
  { id: 'add', target: 'fx.add', kind: 'control' },
  { id: 'rows', target: 'fx.row', kind: 'region', repeat: true },
  { id: 'opener', target: 'fx.opener', kind: 'opener', safety: 'try-it', opens: 'fx.layer' },
  { id: 'inside', target: 'fx.inside', kind: 'field', group: 'fx.layer' },
];

const realRect = Element.prototype.getBoundingClientRect;
const settle = () => act(async () => void (await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))));
const card = () => document.querySelector('[role="dialog"][aria-modal="false"]') as HTMLElement | null;
const heading = () => card()?.querySelector('h2')?.textContent ?? null;
const buttons = () => Array.from(card()?.querySelectorAll('button') ?? []).map((b) => b.textContent);
const ring = () => document.body.querySelector('[data-spotlight="ring"]') as HTMLElement | null;
const calls = vi.fn();

const mount = async (stepId: string, extra?: () => void) => {
  render(
    <MemoryRouter initialEntries={['/acme/clients']}>
      <main>
        <button type="button" data-tour="fx.add" aria-label="add it" onClick={calls} />
        {[0, 1, 2].map((i) => (
          <div key={i} data-tour="fx.row" data-tour-repeat="" />
        ))}
        <button type="button" data-tour="fx.opener" aria-label="open it" onClick={calls} />
      </main>
      <SupportHost />
    </MemoryRouter>,
  );
  extra?.();
  act(() => useSupportStore.getState().startSingle('clients.list', stepId));
  await waitFor(() => expect(card()).not.toBeNull());
  await settle();
};

beforeAll(() => {
  i18n.addResourceBundle(
    'en',
    'supportSales',
    { clients: { list: Object.fromEntries(['add', 'rows', 'opener', 'inside'].map((id) => [id, { title: id.toUpperCase(), body: `${id} body` }])) } },
    true,
    true,
  );
});
afterAll(() => i18n.removeResourceBundle('en', 'supportSales'));

beforeEach(() => {
  Element.prototype.getBoundingClientRect = function (this: Element) {
    return this.hasAttribute('data-tour') || this.hasAttribute('data-tour-layer') ? makeDomRect(ON_SCREEN) : realRect.call(this);
  };
  vi.stubGlobal('localStorage', memoryStorage());
  calls.mockClear();
  useAuthStore.setState({ user: { userId: 'u1', email: 'a@b.c', role: 'STAFF', tenantId: 't1', tenantSlug: 'acme' }, isAuthenticated: true });
  loaders['clients.list'] = async () => ({ default: { pageId: 'clients.list', version: 1, namespace: 'supportSales', steps } });
});

afterEach(() => {
  Element.prototype.getBoundingClientRect = realRect;
  act(() => {
    useSupportStore.getState().endSession();
    useSupportStore.getState().closePanel();
    useAnnouncerStore.getState().clear();
  });
  delete loaders['clients.list'];
  useAuthStore.setState({ user: null, isAuthenticated: false });
  vi.unstubAllGlobals();
});

describe('SUP-04 explaining a single control', () => {
  it('SUP-04 shows one card with the control highlighted, no progress and no Next or Back', async () => {
    await mount('add');
    expect(heading()).toBe('ADD');
    expect(card()!.textContent).toContain('add body');
    expect(ring()).not.toBeNull();
    expect(card()!.textContent).not.toMatch(/Step \d/);
    expect(card()!.querySelector('[role="progressbar"]')).toBeNull();
    expect(buttons()).toEqual(['Explain another', 'Close']);
  });

  it('SUP-04 Close ends the session at once and writes no progress', async () => {
    await mount('add');
    act(() => void fireEvent.click(screen.getByRole('button', { name: 'Close' })));
    await settle();
    expect(card()).toBeNull();
    expect(useSupportStore.getState().mode).toBe('none');
    expect(localStorage.getItem('wellness-support-progress')).toBeNull();
  });

  it('SUP-04 Escape closes it too, with no progress either', async () => {
    await mount('add');
    act(() => void fireEvent.keyDown(document.body, { key: 'Escape' }));
    await settle();
    expect(card()).toBeNull();
    expect(localStorage.getItem('wellness-support-progress')).toBeNull();
  });

  it('SUP-04 the arrow keys do not move anywhere', async () => {
    await mount('add');
    const next = screen.getByRole('button', { name: 'Close' });
    act(() => void fireEvent.keyDown(next, { key: 'ArrowRight' }));
    act(() => void fireEvent.keyDown(next, { key: 'ArrowLeft' }));
    await settle();
    expect(heading()).toBe('ADD');
  });

  it('SUP-12 the control itself still cannot be operated while its explanation is up', async () => {
    await mount('add');
    fireEvent.click(screen.getByRole('button', { name: 'add it' }));
    expect(calls).not.toHaveBeenCalled();
  });

  it('SUP-07 explaining a repeated control highlights the first instance', async () => {
    await mount('rows');
    expect(heading()).toBe('ROWS');
    expect(ring()).not.toBeNull();
  });

  it('SUP-04 "Explain another" goes back to the list of controls', async () => {
    await mount('add');
    act(() => void fireEvent.click(screen.getByRole('button', { name: 'Explain another' })));
    await settle();
    expect(card()).toBeNull();
    expect(useSupportStore.getState()).toMatchObject({ mode: 'none', panelOpen: true, panelView: 'controls' });
  });

  it('SUP-08 a control that disappears is reported, not skipped to something else', async () => {
    await mount('add');
    act(() => document.querySelector('[data-tour="fx.add"]')!.remove());
    await settle();
    expect(heading()).toBe('This item changed or is no longer on the page');
    expect(buttons()).toEqual(['Explain another', 'Close']);
  });

  it('SUP-10 an opener is just a control here: nothing is held, and nothing is waiting for the user', async () => {
    await mount('opener');
    expect(heading()).toBe('OPENER');
    expect(buttons()).toEqual(['Explain another', 'Close']);
    expect(card()!.textContent).not.toContain('never clicks for you');
  });

  it('SUP-04 announces what is being explained', async () => {
    await mount('add');
    expect(screen.getByRole('status').textContent).toBe('Explaining: ADD');
  });

  it('SUP-04 a control that is not in the guide ends the session quietly', async () => {
    render(
      <MemoryRouter initialEntries={['/acme/clients']}>
        <SupportHost />
      </MemoryRouter>,
    );
    act(() => useSupportStore.getState().startSingle('clients.list', 'nope'));
    await settle();
    await settle();
    expect(card()).toBeNull();
    expect(useSupportStore.getState().mode).toBe('none');
  });
});
