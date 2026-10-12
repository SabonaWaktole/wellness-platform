import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import SupportHost from '../../components/support/SupportHost';
import i18n from '../../i18n';
import { makeDomRect, ON_SCREEN } from '../../mocks/mockRect';
import { useAuthStore } from '../../store/useAuthStore';
import { useSupportStore } from '../../store/useSupportStore';
import { useAnnouncerStore } from './announcer';
import { loaders } from './pageRegistry';
import type { GuideStep, PageGuide } from './types';

const GUARDED = ['click', 'pointerdown', 'mousedown', 'touchstart', 'keydown', 'submit', 'dragstart'];
const calls = { del: vi.fn(), save: vi.fn(), submit: vi.fn(), nameKey: vi.fn() };

const Page = () => {
  const [name, setName] = useState('');
  const navigate = useNavigate();
  return (
    <main>
      <button type="button" aria-label="delete client" data-tour="fx.delete" onClick={calls.del} />
      <form onSubmit={(e) => { e.preventDefault(); calls.submit(); }} data-tour="fx.form">
        <input aria-label="name" data-tour="fx.name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={calls.nameKey} />
        <button type="submit" aria-label="save client" data-tour="fx.save" onClick={calls.save} />
      </form>
      <button type="button" aria-label="go elsewhere" onClick={() => navigate('/acme/follow-ups')} />
    </main>
  );
};

const steps = (over: Partial<Record<string, Partial<GuideStep>>> = {}): GuideStep[] => [
  { id: 'del', target: 'fx.delete', kind: 'control', warning: true, ...over.del },
  { id: 'name', target: 'fx.name', kind: 'field', safety: 'try-it', ...over.name },
  { id: 'save', target: 'fx.save', kind: 'submit', ...over.save },
];

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

const realRect = Element.prototype.getBoundingClientRect;
const settle = () => act(async () => void (await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))));
const card = () => document.querySelector('[role="dialog"][aria-modal="false"]') as HTMLElement | null;
const heading = () => card()?.querySelector('h2')?.textContent ?? null;
const press = (name: string) => act(() => void fireEvent.click(screen.getByRole('button', { name })));
const countListeners = (spy: ReturnType<typeof vi.spyOn>) => (spy.mock.calls as unknown[][]).filter(([type]) => GUARDED.includes(type as string)).length;

const mount = async () => {
  render(
    <MemoryRouter initialEntries={['/acme/clients']}>
      <Page />
      <SupportHost />
    </MemoryRouter>,
  );
  act(() => useSupportStore.getState().startTour('clients.list'));
  await waitFor(() => expect(card()).not.toBeNull());
  await settle();
};

beforeAll(() => {
  i18n.addResourceBundle('en', 'supportSales', { clients: { list: Object.fromEntries(['del', 'name', 'save'].map((id) => [id, { title: id.toUpperCase(), body: `${id} body`, warning: id === 'del' ? 'Careful' : undefined }])) } }, true, true);
});
afterAll(() => i18n.removeResourceBundle('en', 'supportSales'));

beforeEach(() => {
  Element.prototype.getBoundingClientRect = function (this: Element) {
    return this.hasAttribute('data-tour') ? makeDomRect(ON_SCREEN) : realRect.call(this);
  };
  vi.stubGlobal('localStorage', memoryStorage());
  Object.values(calls).forEach((c) => c.mockClear());
  useAuthStore.setState({ user: { userId: 'u1', email: 'a@b.c', role: 'STAFF', tenantId: 't1', tenantSlug: 'acme' }, isAuthenticated: true });
  loaders['clients.list'] = async () => ({ default: { pageId: 'clients.list', version: 1, namespace: 'supportSales', steps: steps() } as PageGuide });
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
  vi.restoreAllMocks();
});

describe('SUP-12 a running tour is read-only', () => {
  it('SUP-12 clicking, pressing Enter or Space on Delete and Save, or submitting the form, calls no app handler', async () => {
    await mount();
    expect(heading()).toBe('DEL');
    const del = screen.getByRole('button', { name: 'delete client' });
    const save = screen.getByRole('button', { name: 'save client' });
    fireEvent.click(del);
    fireEvent.click(save);
    for (const key of ['Enter', ' ']) {
      expect(fireEvent.keyDown(del, { key })).toBe(false);
      expect(fireEvent.keyDown(save, { key })).toBe(false);
    }
    fireEvent.submit(save.closest('form')!);
    expect(calls.del).not.toHaveBeenCalled();
    expect(calls.save).not.toHaveBeenCalled();
    expect(calls.submit).not.toHaveBeenCalled();
  });

  it('SUP-12 the same controls work once the tour is exited', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: 'delete client' }));
    expect(calls.del).not.toHaveBeenCalled();
    press('Exit');
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'delete client' }));
    fireEvent.submit(screen.getByLabelText('name').closest('form')!);
    expect(calls.del).toHaveBeenCalledTimes(1);
    expect(calls.submit).toHaveBeenCalledTimes(1);
  });

  it('SUP-12 the control of a try-it step can be used, and only that one', async () => {
    await mount();
    press('Next');
    await settle();
    expect(heading()).toBe('NAME');
    fireEvent.change(screen.getByLabelText('name'), { target: { value: 'Ana' } });
    expect(screen.getByLabelText('name')).toHaveValue('Ana');
    fireEvent.click(screen.getByRole('button', { name: 'delete client' }));
    expect(calls.del).not.toHaveBeenCalled();
  });

  it('SUP-12 a destructive step is explain-only even if its guide says try-it', async () => {
    loaders['clients.list'] = async () => ({
      default: { pageId: 'clients.list', version: 1, namespace: 'supportSales', steps: steps({ del: { safety: 'try-it' }, name: { warning: undefined } }).map((s) => (s.id === 'del' ? { ...s, safety: 'try-it' as const } : s)) } as PageGuide,
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const caught: unknown[] = [];
    window.addEventListener('error', (e) => { caught.push(e.error); e.preventDefault(); });
    render(
      <MemoryRouter initialEntries={['/acme/clients']}>
        <Page />
        <SupportHost />
      </MemoryRouter>,
    );
    act(() => useSupportStore.getState().startTour('clients.list'));
    await settle();
    await settle();
    // In development the hand-written mistake is loud; either way the delete handler is never reached.
    expect(String(caught[0] ?? error.mock.calls[0]?.[0] ?? '')).toMatch(/del|try-it|destructive/i);
    fireEvent.click(screen.getByRole('button', { name: 'delete client' }));
    expect(calls.del).not.toHaveBeenCalled();
  });

  it('SUP-13 Tab and typing still work while the tour runs', async () => {
    await mount();
    press('Next');
    await settle();
    expect(fireEvent.keyDown(screen.getByLabelText('name'), { key: 'Tab' })).toBe(true);
    expect(fireEvent.keyDown(screen.getByLabelText('name'), { key: 'a' })).toBe(true);
    expect(calls.nameKey).toHaveBeenCalledTimes(2);
  });

  it('SUP-12 says once, on the card and to a screen reader, that the control is for after the tour', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: 'delete client' }));
    await settle();
    expect(card()!.textContent).toContain('Exit the tour to use this control.');
    expect(screen.getByRole('status').textContent).toContain('Exit the tour to use this control.');
    fireEvent.click(screen.getByRole('button', { name: 'delete client' }));
    await settle();
    expect(card()!.textContent!.match(/Exit the tour to use this control/g)).toHaveLength(1);
  });

  it('SUP-12 says "to submit" when a form is the thing that was blocked', async () => {
    await mount();
    fireEvent.submit(screen.getByLabelText('name').closest('form')!);
    await settle();
    expect(card()!.textContent).toContain('Exit the tour to submit.');
  });
});

describe('SUP-19 the guard is gone on every way out', () => {
  const baseline = async (end: () => Promise<void>) => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    await mount();
    expect(countListeners(add)).toBeGreaterThan(0);
    await end();
    await settle();
    await waitFor(() => expect(countListeners(remove)).toBe(countListeners(add)));
    fireEvent.click(screen.getByRole('button', { name: 'delete client' }));
    expect(calls.del).toHaveBeenCalledTimes(1);
  };

  it('SUP-19 after Exit', async () => baseline(async () => void press('Exit')));
  it('SUP-19 after Skip tour', async () => baseline(async () => void press('Skip tour')));
  it('SUP-19 after the tour is finished and its card closed', async () =>
    baseline(async () => {
      press('Next');
      await settle();
      press('Next');
      await settle();
      press('Finish');
      await settle();
      press('Close');
    }));
  it('SUP-19 after the route changes', async () => baseline(async () => void fireEvent.click(screen.getByRole('button', { name: 'go elsewhere' }))));
});
