import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ImpersonationBanner } from './ImpersonationBanner';
import { useAuthStore } from '../../../store/useAuthStore';

const renderBanner = () =>
  render(
    <MemoryRouter>
      <ImpersonationBanner />
    </MemoryRouter>
  );

describe('ImpersonationBanner', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, impersonating: null, isAuthenticated: false });
  });

  // Mounted unconditionally by AppLayout, so the ordinary case must cost
  // nothing and show nothing.
  it('renders nothing for an ordinary session', () => {
    const { container } = renderBanner();
    expect(container).toBeEmptyDOMElement();
  });

  it('names the workspace being managed', () => {
    useAuthStore.setState({
      impersonating: { adminEmail: 'admin@platform.test', tenantSlug: 'acme', tenantName: 'Acme' },
    });

    renderBanner();
    expect(screen.getByText('Acme')).toBeInTheDocument();
  });

  // A workspace whose name has not loaded is still identifiable by its slug —
  // the banner must never render without saying WHICH workspace.
  it('falls back to the slug when the name is missing', () => {
    useAuthStore.setState({
      impersonating: { adminEmail: 'admin@platform.test', tenantSlug: 'acme', tenantName: null },
    });

    renderBanner();
    expect(screen.getByText('acme')).toBeInTheDocument();
  });

  it('offers a way out', () => {
    useAuthStore.setState({
      impersonating: { adminEmail: 'admin@platform.test', tenantSlug: 'acme', tenantName: 'Acme' },
    });

    renderBanner();
    expect(screen.getByRole('button', { name: /exit to admin console/i })).toBeEnabled();
  });

  it('collapses to just the arrow and expands again', () => {
    useAuthStore.setState({
      impersonating: { adminEmail: 'admin@platform.test', tenantSlug: 'acme', tenantName: 'Acme' },
    });

    renderBanner();
    fireEvent.click(screen.getByRole('button', { name: /hide workspace notice/i }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /show workspace notice/i }));
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

describe('useAuthStore impersonation lifecycle', () => {
  // A stale banner surviving a re-login would misreport whose data is on
  // screen, which is the one thing this feature must never do.
  it('clears impersonation when a new session is set without it', () => {
    useAuthStore.setState({
      impersonating: { adminEmail: 'a@b.test', tenantSlug: 'acme', tenantName: 'Acme' },
    });

    useAuthStore.getState().setUser({
      userId: '1',
      email: 'owner@acme.test',
      role: 'BUSINESS_OWNER',
      tenantId: 't1',
      tenantSlug: 'acme',
    });

    expect(useAuthStore.getState().impersonating).toBeNull();
  });

  it('clears impersonation on logout', () => {
    useAuthStore.setState({
      impersonating: { adminEmail: 'a@b.test', tenantSlug: 'acme', tenantName: 'Acme' },
    });

    useAuthStore.getState().logout();

    expect(useAuthStore.getState().impersonating).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});
