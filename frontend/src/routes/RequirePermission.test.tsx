import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RequirePermission } from './RequirePermission';
import { useAuthStore } from '../store/useAuthStore';

describe('RequirePermission (FR-RBAC-05, 07)', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, isAuthenticated: false, isInitializing: false });
  });

  it('blocks a user with no user set', () => {
    render(
      <MemoryRouter initialEntries={['/reports']}>
        <Routes>
          <Route
            path="/reports"
            element={
              <RequirePermission permission="reports.view">
                <p>Reports</p>
              </RequirePermission>
            }
          />
          <Route path="/unauthorized" element={<p>Unauthorized</p>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.queryByText('Reports')).not.toBeInTheDocument();
    expect(screen.getByText('Unauthorized')).toBeInTheDocument();
  });

  it('blocks a user missing the permission', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        userId: '1',
        role: 'STAFF',
        tenantId: 't1',
        tenantSlug: 't1',
        email: 'test@example.com',
        permissions: { 'companies.view': 'OWN' },
      },
    });
    render(
      <MemoryRouter initialEntries={['/reports']}>
        <Routes>
          <Route
            path="/reports"
            element={
              <RequirePermission permission="reports.view">
                <p>Reports</p>
              </RequirePermission>
            }
          />
          <Route path="/unauthorized" element={<p>Unauthorized</p>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.queryByText('Reports')).not.toBeInTheDocument();
    expect(screen.getByText('Unauthorized')).toBeInTheDocument();
  });

  it('allows a user holding the permission', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        userId: '1',
        role: 'BUSINESS_OWNER',
        tenantId: 't1',
        tenantSlug: 't1',
        email: 'test@example.com',
        permissions: { 'reports.view': true },
      },
    });
    render(
      <MemoryRouter initialEntries={['/reports']}>
        <Routes>
          <Route
            path="/reports"
            element={
              <RequirePermission permission="reports.view">
                <p>Reports</p>
              </RequirePermission>
            }
          />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('Reports')).toBeInTheDocument();
  });
});
