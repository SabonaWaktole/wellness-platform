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
import type { PageGuide } from './types';

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

const guide: PageGuide = {
  pageId: 'clients.list',
  version: 1,
  namespace: 'supportSales',
  steps: [
    { id: 'add', target: 'fx.add', kind: 'control' },
    { id: 'rows', target: 'fx.row', kind: 'region', repeat: true },
  ],
};

const click = vi.fn();
const realRect = Element.prototype.getBoundingClientRect;
const settle = () => act(async () => void (await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))));
const card = () => document.querySelector('[role="dialog"][aria-modal="false"]') as HTMLElement | null;
const heading = () => card()?.querySelector('h2')?.textContent ?? null;
const ring = () => document.body.querySelector('[data-spotlight="ring"]') as HTMLElement | null;
const banner = () => document.body.querySelector('[data-support-ui] [aria-live]') as HTMLElement | null;
const el = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement;
const buttons = () => Array.from(card()?.querySelectorAll('button') ?? []).map((b) => b.textContent);
const move = (target: Element) => act(() => void fireEvent.pointerMove(target));
const tab = (shiftKey = false) => act(() => void fireEvent.keyDown(document.body, { key: 'Tab', shiftKey }));
const FALLBACK = 'No help written for this control yet';

const Page = () => (
  <main>
    <button type="button" data-testid="add" data-tour="fx.add" onClick={click}>
      <span data-testid="add-inner">{'Add'}</span>
    </button>
    <div data-testid="row1" data-tour="fx.row" data-tour-repeat="" />
    <div data-testid="row2" data-tour="fx.row" data-tour-repeat="" />
    <input data-testid="find" data-tour="fx.find" data-tour-kind="search" aria-label="find" />
    <button type="button" data-testid="mystery" data-tour="fx.mystery" onClick={click} />
    <button type="button" data-testid="plain" onClick={click} />
    <div data-testid="hidden" data-tour="fx.hidden" />
    <a href="#x" data-testid="navitem" data-tour="shell.nav.item" data-tour-repeat="">{'Clients'}</a>
  </main>
);

const mount = async () => {
  render(
    <MemoryRouter initialEntries={['/acme/clients']}>
      <Page />
      <SupportHost />
    </MemoryRouter>,
  );
  act(() => useSupportStore.getState().startPick('clients.list'));
  await waitFor(() => expect(banner()).not.toBeNull());
  await settle();
};

beforeAll(() => {
  i18n.addResourceBundle(
    'en',
    'supportSales',
    { clients: { list: { add: { title: 'ADD', body: 'add body' }, rows: { title: 'ROWS', body: 'rows body' } } } },
    true,
    true,
  );
});
afterAll(() => i18n.removeResourceBundle('en', 'supportSales'));

beforeEach(() => {
  Element.prototype.getBoundingClientRect = function (this: Element) {
    if ((this as HTMLElement).dataset?.testid === 'hidden') return realRect.call(this);
    return this.hasAttribute('data-tour') ? makeDomRect(ON_SCREEN) : realRect.call(this);
  };
  vi.stubGlobal('localStorage', memoryStorage());
  click.mockClear();
  useAuthStore.setState({ user: { userId: 'u1', email: 'a@b.c', role: 'STAFF', tenantId: 't1', tenantSlug: 'acme' }, isAuthenticated: true });
  loaders['clients.list'] = async () => ({ default: guide });
});

afterEach(() => {
  Element.prototype.getBoundingClientRect = realRect;
  act(() => {
    useSupportStore.getState().endSession();
    useAnnouncerStore.getState().clear();
  });
  delete loaders['clients.list'];
  useAuthStore.setState({ user: null, isAuthenticated: false });
  vi.unstubAllGlobals();
});

describe('SUP-04 pointing at a control', () => {
  it('SUP-04 shows a banner and waits: no card, no highlight yet', async () => {
    await mount();
    expect(banner()).not.toBeNull();
    expect(screen.getByText('Pick a control. Press Escape to cancel.')).toBeInTheDocument();
    expect(card()).toBeNull();
    expect(ring()).toBeNull();
  });

  it('SUP-04 hovering highlights the nearest annotated element, and the banner names it', async () => {
    await mount();
    move(el('add-inner'));
    await settle();
    expect(ring()).not.toBeNull();
    expect(banner()!.textContent).toBe('Highlighted: ADD');
  });

  it('SUP-04 hovering something not annotated highlights nothing', async () => {
    await mount();
    move(el('add'));
    move(el('plain'));
    await settle();
    expect(ring()).toBeNull();
    expect(banner()!.textContent).toBe('');
  });

  it('SUP-04 clicking explains the control and does not operate it', async () => {
    await mount();
    fireEvent.click(el('add-inner'));
    await settle();
    expect(heading()).toBe('ADD');
    expect(card()!.textContent).toContain('add body');
    expect(click).not.toHaveBeenCalled();
    expect(buttons()).toEqual(['Pick another', 'Close']);
    expect(card()!.textContent).not.toMatch(/Step \d/);
  });

  it('SUP-04 clicking something not annotated does nothing at all', async () => {
    await mount();
    fireEvent.click(el('plain'));
    await settle();
    expect(card()).toBeNull();
    expect(click).not.toHaveBeenCalled();
  });

  it('SUP-07 a repeated control is explained once for every instance', async () => {
    await mount();
    fireEvent.click(el('row2'));
    await settle();
    expect(heading()).toBe('ROWS');
  });

  it('SUP-04 "Pick another" goes back to pointing, with the banner still up', async () => {
    await mount();
    fireEvent.click(el('add'));
    await settle();
    act(() => void fireEvent.click(screen.getByRole('button', { name: 'Pick another' })));
    await settle();
    expect(card()).toBeNull();
    expect(banner()).not.toBeNull();
    expect(useSupportStore.getState().mode).toBe('pick');
  });

  it('SUP-04 clicking another control while a card is up explains that one instead', async () => {
    await mount();
    fireEvent.click(el('add'));
    await settle();
    fireEvent.click(el('row1'));
    await settle();
    expect(heading()).toBe('ROWS');
  });

  it('SUP-04 Close leaves pick mode, and the page is itself again', async () => {
    await mount();
    fireEvent.click(el('add'));
    await settle();
    act(() => void fireEvent.click(screen.getByRole('button', { name: 'Close' })));
    await settle();
    expect(useSupportStore.getState().mode).toBe('none');
    fireEvent.click(el('plain'));
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('SUP-04 the banner’s Cancel leaves pick mode', async () => {
    await mount();
    act(() => void fireEvent.click(screen.getByRole('button', { name: 'Cancel' })));
    await settle();
    expect(useSupportStore.getState().mode).toBe('none');
  });
});

describe('SUP-05 what is said about a control', () => {
  it('SUP-05 a control with no step of its own borrows the shared guidance for its kind', async () => {
    await mount();
    fireEvent.click(el('find'));
    await settle();
    expect(heading()).toBe('Search this page');
  });

  it('SUP-05 a shell control is explained from the shell guide, wherever the page is', async () => {
    await mount();
    fireEvent.click(el('navitem'));
    await settle();
    expect(heading()).toBe('A menu entry');
  });

  it('SUP-05 a control nobody has explained gets an honest card, not invented text', async () => {
    await mount();
    fireEvent.click(el('mystery'));
    await settle();
    expect(heading()).toBe(FALLBACK);
    expect(card()!.textContent).toContain('nobody has explained it here yet');
    expect(click).not.toHaveBeenCalled();
  });

  it('SUP-05 works on a page that has no guide at all', async () => {
    delete loaders['clients.list'];
    await mount();
    fireEvent.click(el('navitem'));
    await settle();
    expect(heading()).toBe('A menu entry');
    act(() => void fireEvent.click(screen.getByRole('button', { name: 'Pick another' })));
    fireEvent.click(el('add'));
    await settle();
    expect(heading()).toBe(FALLBACK);
  });
});

describe('SUP-13 pointing with the keyboard', () => {
  it('SUP-13 Tab moves through the annotated controls that are visible, in page order, and says each name', async () => {
    await mount();
    const seen: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      tab();
      await settle();
      seen.push(banner()!.textContent ?? '');
    }
    expect(seen[0]).toBe('Highlighted: ADD');
    expect(seen[1]).toBe('Highlighted: ROWS');
    expect(seen[2]).toBe('Highlighted: ROWS');
    expect(seen[3]).toBe('Highlighted: Search this page');
    expect(seen.join('|')).not.toContain('fx.hidden');
  });

  it('SUP-13 skips an annotated element that is not visible', async () => {
    await mount();
    for (let i = 0; i < 12; i += 1) {
      tab();
      await settle();
      expect(ring()?.style.width).not.toBe('0px');
    }
  });

  it('SUP-13 Shift+Tab goes the other way and wraps', async () => {
    await mount();
    tab(true);
    await settle();
    expect(banner()!.textContent).toBe('Highlighted: A menu entry');
    tab();
    await settle();
    expect(banner()!.textContent).toBe('Highlighted: ADD');
  });

  it('SUP-13 Enter explains the highlighted control', async () => {
    await mount();
    tab();
    await settle();
    act(() => void fireEvent.keyDown(document.body, { key: 'Enter' }));
    await settle();
    expect(heading()).toBe('ADD');
    expect(click).not.toHaveBeenCalled();
  });

  it('SUP-13 Enter with nothing highlighted does nothing', async () => {
    await mount();
    act(() => void fireEvent.keyDown(document.body, { key: 'Enter' }));
    await settle();
    expect(card()).toBeNull();
  });

  it('SUP-13 Escape leaves pick mode, from the banner and from a card', async () => {
    await mount();
    act(() => void fireEvent.keyDown(document.body, { key: 'Escape' }));
    await settle();
    expect(useSupportStore.getState().mode).toBe('none');
    expect(banner()).toBeNull();

    await mount();
    fireEvent.click(el('add'));
    await settle();
    act(() => void fireEvent.keyDown(document.body, { key: 'Escape' }));
    await settle();
    expect(useSupportStore.getState().mode).toBe('none');
  });

  it('SUP-08 controls that appear after pick mode started can be reached, and ones that left cannot', async () => {
    await mount();
    const late = document.createElement('button');
    late.setAttribute('data-tour', 'fx.late');
    late.setAttribute('data-testid', 'late');
    document.querySelector('main')!.append(late);
    for (let i = 0; i < 8; i += 1) {
      tab();
      await settle();
      if (banner()!.textContent === 'Highlighted: fx.late') break;
    }
    expect(banner()!.textContent).toBe('Highlighted: fx.late');
    late.remove();
    await settle();
    fireEvent.click(el('add'));
    await settle();
    expect(heading()).toBe('ADD');
  });
});

describe('SUP-19 pick mode leaves nothing behind', () => {
  it('SUP-19 removes every listener when it ends', async () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    await mount();
    const mine = ['pointermove', 'keydown', 'click', 'mousedown', 'submit'];
    const count = (spy: typeof add) => spy.mock.calls.filter(([type]) => mine.includes(type as string)).length;
    expect(count(add)).toBeGreaterThan(0);
    act(() => void fireEvent.keyDown(document.body, { key: 'Escape' }));
    await settle();
    await waitFor(() => expect(count(remove)).toBe(count(add)));
  });
});
