import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Can } from './Can';
import { useAuthStore } from '../../store/useAuthStore';

describe('<Can> (FR-RBAC-07)', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, isAuthenticated: false, isInitializing: false });
  });

  it('renders children when the permission is held', () => {
    useAuthStore.setState({
      user: {
        userId: '1',
        role: 'BUSINESS_OWNER',
        tenantId: 't1',
        tenantSlug: 't1',
        email: 'e',
        permissions: { 'users.manage': true },
      },
    });
    render(
      <Can permission="users.manage">
        <p>Manage users</p>
      </Can>
    );
    expect(screen.getByText('Manage users')).toBeInTheDocument();
  });

  it('renders nothing by default when the permission is not held', () => {
    useAuthStore.setState({
      user: { userId: '1', role: 'STAFF', tenantId: 't1', tenantSlug: 't1', email: 'e', permissions: {} },
    });
    render(
      <Can permission="users.manage">
        <p>Manage users</p>
      </Can>
    );
    expect(screen.queryByText('Manage users')).not.toBeInTheDocument();
  });

  it('renders the fallback when provided and the permission is not held', () => {
    useAuthStore.setState({
      user: { userId: '1', role: 'STAFF', tenantId: 't1', tenantSlug: 't1', email: 'e', permissions: {} },
    });
    render(
      <Can permission="users.manage" fallback={<p>No access</p>}>
        <p>Manage users</p>
      </Can>
    );
    expect(screen.getByText('No access')).toBeInTheDocument();
    expect(screen.queryByText('Manage users')).not.toBeInTheDocument();
  });
});
