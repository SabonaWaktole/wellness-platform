import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { announce, useAnnouncerStore } from '../../lib/support/announcer';
import { subscriberCount } from '../../lib/support/domObserverHub';
import { TenantGuard } from '../../routes/TenantGuard';
import { useAuthStore } from '../../store/useAuthStore';
import { useSupportStore } from '../../store/useSupportStore';
import SupportHost from './SupportHost';
import { SupportHostLazy } from './SupportHostLazy';

afterEach(() => {
  act(() => {
    useSupportStore.getState().endSession();
    useAnnouncerStore.getState().clear();
  });
  useAuthStore.setState({ user: null, isAuthenticated: false });
  vi.restoreAllMocks();
});

describe('SUP-19 the Support host costs nothing until it is used', () => {
  it('SUP-19 renders nothing with no session and registers no observers or listeners', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const windowAdd = vi.spyOn(window, 'addEventListener');
    const { container } = render(
      <MemoryRouter>
        <SupportHost />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
    expect(subscriberCount()).toBe(0);
    expect(add.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(0);
    expect(windowAdd.mock.calls.filter(([type]) => type === 'resize' || type === 'scroll')).toHaveLength(0);
  });

  it('SUP-19 the lazy gate renders nothing, and does not load the host, while there is no session', () => {
    const { container } = render(
      <MemoryRouter>
        <SupportHostLazy />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('SUP-14 keeps its live region long enough to say that the tour closed', async () => {
    render(
      <MemoryRouter>
        <SupportHostLazy />
      </MemoryRouter>,
    );
    act(() => announce('Tour closed'));
    expect(await screen.findByRole('status')).toHaveTextContent('Tour closed');
  });

  it('SUP-19 the gate keeps the host in its own chunk: only SupportHostLazy imports it, and dynamically', () => {
    const lazy = readFileSync(resolve(__dirname, 'SupportHostLazy.tsx'), 'utf8');
    expect(lazy).toMatch(/lazy\(\(\) => import\('\.\/SupportHost'\)\)/);
    expect(lazy).not.toMatch(/^import .* from '\.\/SupportHost'/m);
  });
});

describe('SUP-02 the host is mounted once per shell', () => {
  it('SUP-02 the tenant route renders the host next to the page', () => {
    useAuthStore.setState({
      user: { userId: 'u1', email: 'a@b.c', role: 'STAFF', tenantId: 't1', tenantSlug: 'acme' },
      isAuthenticated: true,
    });
    render(
      <MemoryRouter initialEntries={['/acme/anything']}>
        <Routes>
          <Route path="/:tenantSlug" element={<TenantGuard />}>
            <Route path="anything" element={<p>{'Page'}</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByRole('status')).toBeNull();
    act(() => announce('Hello'));
    expect(screen.getByRole('status')).toHaveTextContent('Hello');
  });

  it('SUP-02 the platform admin shell mounts the same host, so all six /admin routes get it', () => {
    const source = readFileSync(resolve(__dirname, '..', '..', 'pages', 'shell', 'SuperAdminShell.tsx'), 'utf8');
    expect(source).toContain('<SupportHostLazy />');
  });

  it('SUP-02 routes/index.tsx is untouched by the host', () => {
    const routes = readFileSync(resolve(__dirname, '..', '..', 'routes', 'index.tsx'), 'utf8');
    expect(routes).not.toMatch(/SupportHost/);
  });
});
