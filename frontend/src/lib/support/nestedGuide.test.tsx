import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import SupportHost from '../../components/support/SupportHost';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog/ConfirmDialog';
import { DropdownMenu } from '../../components/ui/DropdownMenu/DropdownMenu';
import { Modal } from '../../components/ui/Modal/Modal';
import { Tabs } from '../../components/ui/Tabs/Tabs';
import { SlideOver } from '../../components/ui/SlideOver/SlideOver';
import i18n from '../../i18n';
import { makeDomRect, ON_SCREEN } from '../../mocks/mockRect';
import { useAuthStore } from '../../store/useAuthStore';
import { useSupportStore } from '../../store/useSupportStore';
import { useAnnouncerStore } from './announcer';
import { loaders } from './pageRegistry';
import type { PageGuide } from './types';

type Kind = 'modal' | 'slideover' | 'confirm' | 'menu';
const KINDS: Kind[] = ['modal', 'slideover', 'confirm', 'menu'];
const LOST = 'This item changed or is no longer on the page';

const guide = (): PageGuide => ({
  pageId: 'clients.list',
  version: 1,
  namespace: 'supportSales',
  steps: [
    { id: 'intro', target: 'fx.intro', kind: 'region' },
    { id: 'opener', target: 'fx.opener', kind: 'opener', safety: 'try-it', opens: 'fx.layer' },
    { id: 'field', target: 'fx.field', kind: 'field', group: 'fx.layer' },
    { id: 'save', target: 'fx.save', kind: 'control', group: 'fx.layer' },
    { id: 'outro', target: 'fx.outro', kind: 'region' },
  ],
});

const spy = vi.fn();

const Fixture = ({ kind }: { kind: Kind }) => {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const inner = (
    <>
      <input data-tour="fx.field" aria-label="field" />
      <button type="button" data-tour="fx.save" aria-label="save" onClick={spy} />
    </>
  );
  return (
    <main>
      <p data-tour="fx.intro">{'Intro text'}</p>
      {kind !== 'menu' && <button type="button" aria-label="open it" data-tour="fx.opener" onClick={() => setOpen(true)} />}
      {kind === 'modal' && (
        <Modal isOpen={open} onClose={close} title="Fixture dialog" tourId="fx.layer">
          {inner}
        </Modal>
      )}
      {kind === 'slideover' && (
        <SlideOver isOpen={open} onClose={close} title="Fixture panel" tourId="fx.layer">
          {inner}
        </SlideOver>
      )}
      {kind === 'confirm' && (
        <ConfirmDialog isOpen={open} onClose={close} onConfirm={spy} title="Fixture confirm" message={inner} tourId="fx.layer" />
      )}
      {kind === 'menu' && (
        <DropdownMenu
          trigger={<button type="button" aria-label="open it" data-tour="fx.opener" />}
          menuTourId="fx.layer"
          items={[
            { id: 'edit', label: 'Edit', onClick: spy, tourId: 'fx.field' },
            { id: 'delete', label: 'Delete', onClick: spy, tourId: 'fx.save', danger: true },
          ]}
        />
      )}
      <p data-tour="fx.outro">{'Outro text'}</p>
    </main>
  );
};

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

const realRect = Element.prototype.getBoundingClientRect;
const settle = () => act(async () => void (await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))));
const card = () => document.querySelector('[role="dialog"][aria-modal="false"]') as HTMLElement | null;
const heading = () => card()?.querySelector('h2')?.textContent ?? null;
const headingIs = (text: string) => waitFor(() => expect(heading()).toBe(text), { timeout: 4000 });
const press = (name: RegExp | string) => act(() => void fireEvent.click(within(card()!, name)));
const within = (root: HTMLElement, name: RegExp | string) =>
  Array.from(root.querySelectorAll('button')).find((b) => (typeof name === 'string' ? b.textContent === name : name.test(b.textContent ?? ''))) as HTMLElement;
const opener = () => document.querySelector('[aria-label="open it"]') as HTMLElement;

const mount = async (kind: Kind) => {
  render(
    <MemoryRouter initialEntries={['/acme/clients']}>
      <Fixture kind={kind} />
      <SupportHost />
    </MemoryRouter>,
  );
  act(() => useSupportStore.getState().startTour('clients.list'));
  await waitFor(() => expect(card()).not.toBeNull());
  await settle();
};

beforeAll(() => {
  i18n.addResourceBundle(
    'en',
    'supportSales',
    { clients: { list: Object.fromEntries(['intro', 'opener', 'field', 'save', 'outro'].map((id) => [id, { title: id[0].toUpperCase() + id.slice(1), body: `${id} body` }])) } },
    true,
    true,
  );
});
afterAll(() => i18n.removeResourceBundle('en', 'supportSales'));

beforeEach(() => {
  // jsdom has no layout: give every annotated element and every layer a box, so the resolver sees it.
  Element.prototype.getBoundingClientRect = function (this: Element) {
    return this.hasAttribute('data-tour') || this.hasAttribute('data-tour-layer') ? makeDomRect(ON_SCREEN) : realRect.call(this);
  };
  vi.stubGlobal('localStorage', memoryStorage());
  spy.mockClear();
  useAuthStore.setState({ user: { userId: 'u1', email: 'a@b.c', role: 'STAFF', tenantId: 't1', tenantSlug: 'acme' }, isAuthenticated: true });
  loaders['clients.list'] = async () => ({ default: guide() });
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

describe.each(KINDS)('SUP-10 a step that opens a %s', (kind) => {
  it('SUP-10 holds at the opener, follows the user into the layer, and carries on after it closes', async () => {
    await mount(kind);
    expect(heading()).toBe('Intro');
    press('Next');
    await settle();
    expect(heading()).toBe('Opener');
    expect(within(card()!, 'Next')).toBeUndefined();
    expect(within(card()!, 'Skip this part')).toBeDefined();

    act(() => void fireEvent.click(opener()));
    await settle();
    await headingIs('Field');
    expect(card()!.textContent).toContain('Step 1 of 2');

    press('Next');
    await settle();
    expect(heading()).toBe('Save');
    press('Continue');
    await settle();
    expect(heading()).toBe('Close it to continue');

    act(() => void fireEvent.keyDown(document.body, { key: 'Escape' }));
    await headingIs('Outro');
    expect(spy).not.toHaveBeenCalled();
  });

  it('SUP-10 the user closing the layer early brings the tour back to the opener, offering to show it again', async () => {
    await mount(kind);
    press('Next');
    await settle();
    act(() => void fireEvent.click(opener()));
    await headingIs('Field');
    act(() => void fireEvent.keyDown(document.body, { key: 'Escape' }));
    await headingIs('Opener');
    expect(card()!.textContent).toContain('Want to see it again?');
    expect(card()).not.toBeNull();
  });

  it('SUP-10 "Skip this part" jumps past the whole group when the user never opens it', async () => {
    await mount(kind);
    press('Next');
    await settle();
    press('Skip this part');
    await settle();
    expect(heading()).toBe('Outro');
  });

  it('SUP-10 skips the part, with an announcement, when the opener becomes disabled while waiting', async () => {
    await mount(kind);
    press('Next');
    await settle();
    expect(heading()).toBe('Opener');
    act(() => opener().setAttribute('disabled', ''));
    await settle();
    expect(heading()).toBe('Outro');
    expect(screen.getByRole('status').textContent).toContain('Skipped: Opener is not available right now');
  });

  it('SUP-13 Escape: exits the tour while it is only explaining, but is left to the layer once the tour waits for it', async () => {
    await mount(kind);
    press('Next');
    await settle();
    // Waiting for the user to open the layer: Escape is the app's, the tour stays.
    act(() => void fireEvent.keyDown(document.body, { key: 'Escape' }));
    await settle();
    expect(heading()).toBe('Opener');
    // Inside the layer: Escape closes the layer, and the tour returns to the opener rather than ending.
    act(() => void fireEvent.click(opener()));
    await headingIs('Field');
    act(() => void fireEvent.keyDown(document.body, { key: 'Escape' }));
    await headingIs('Opener');
    expect(card()).not.toBeNull();
  });

  it('SUP-13 Escape while the tour is just explaining exits it', async () => {
    await mount(kind);
    expect(heading()).toBe('Intro');
    act(() => void fireEvent.keyDown(document.body, { key: 'Escape' }));
    await settle();
    expect(card()).toBeNull();
  });

  it('SUP-08 the layer’s exit animation is never mistaken for a lost control', async () => {
    await mount(kind);
    press('Next');
    await settle();
    act(() => void fireEvent.click(opener()));
    await headingIs('Field');
    act(() => void fireEvent.keyDown(document.body, { key: 'Escape' }));
    const seen = new Set<string>();
    for (let i = 0; i < 40; i += 1) {
      await act(async () => void (await new Promise((r) => setTimeout(r, 40))));
      seen.add(heading() ?? '');
    }
    expect(seen.has(LOST)).toBe(false);
    expect(heading()).toBe('Opener');
  }, 10000);
});

describe('SUP-10 the menu stays open while the tour explains it', () => {
  it('SUP-10 pressing the tour’s own buttons does not count as a click outside the menu', async () => {
    await mount('menu');
    press('Next');
    await settle();
    act(() => void fireEvent.click(opener()));
    await headingIs('Field');
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.mouseDown(within(card()!, 'Next'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    press('Next');
    await settle();
    expect(heading()).toBe('Save');
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it('SUP-10 a click outside the menu and outside the tour still closes it', async () => {
    await mount('menu');
    press('Next');
    await settle();
    act(() => void fireEvent.click(opener()));
    await headingIs('Field');
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });
});

describe('SUP-10 a tab step', () => {
  const TabsFixture = () => {
    const [active, setActive] = useState('a');
    return (
      <main>
        <Tabs
          tourId="fx.tabs"
          tabs={[
            { id: 'a', label: 'First' },
            { id: 'b', label: 'Second' },
          ]}
          activeId={active}
          onChange={setActive}
        />
        <p data-tour="fx.outro">{'Outro text'}</p>
      </main>
    );
  };

  beforeEach(() => {
    i18n.addResourceBundle('en', 'supportSales', { clients: { list: { tabB: { title: 'Second tab', body: 'Select it.' } } } }, true, true);
    loaders['clients.list'] = async () => ({
      default: {
        pageId: 'clients.list',
        version: 1,
        namespace: 'supportSales',
        steps: [
          { id: 'tabB', target: 'fx.tabs.tab.b', kind: 'tab', safety: 'try-it', advanceWhen: 'selected' },
          { id: 'outro', target: 'fx.outro', kind: 'region' },
        ],
      },
    });
  });

  it('SUP-10 waits for the user to select the tab, then moves on by itself', async () => {
    render(
      <MemoryRouter initialEntries={['/acme/clients']}>
        <TabsFixture />
        <SupportHost />
      </MemoryRouter>,
    );
    act(() => useSupportStore.getState().startTour('clients.list'));
    await waitFor(() => expect(card()).not.toBeNull());
    await settle();
    expect(heading()).toBe('Second tab');
    act(() => void fireEvent.click(screen.getByRole('tab', { name: 'Second' })));
    await headingIs('Outro');
  });

  it('SUP-10 does not move on while the tab is not selected', async () => {
    render(
      <MemoryRouter initialEntries={['/acme/clients']}>
        <TabsFixture />
        <SupportHost />
      </MemoryRouter>,
    );
    act(() => useSupportStore.getState().startTour('clients.list'));
    await waitFor(() => expect(card()).not.toBeNull());
    await settle();
    await settle();
    expect(heading()).toBe('Second tab');
  });
});
