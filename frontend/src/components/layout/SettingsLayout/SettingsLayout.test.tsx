import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SettingsLayout } from './SettingsLayout';
import { useAuthStore } from '../../../store/useAuthStore';

const renderAs = (permissions: Record<string, string | true>) => {
  useAuthStore.setState({ user: { userId: 'me', email: 'me@example.com', role: 'STAFF', tenantId: 't1', permissions } } as any);
  render(
    <MemoryRouter initialEntries={['/acme/settings/profile']}>
      <Routes>
        <Route path="/:tenantSlug/settings/profile" element={<SettingsLayout activeNavId="profile"><p>{'content'}</p></SettingsLayout>} />
      </Routes>
    </MemoryRouter>
  );
};

describe('SettingsLayout', () => {
  it('FR-RBAC-07 links to Roles & Permissions for a user who can manage roles', () => {
    renderAs({ 'roles.manage': true, 'users.manage': true });

    const links = screen.getAllByRole('link', { name: 'Roles & Permissions' });
    expect(links[0].getAttribute('href')).toBe('/acme/settings/roles');
  });

  it('FR-RBAC-07 hides it from a user who cannot', () => {
    renderAs({ 'users.manage': true });

    expect(screen.queryByRole('link', { name: 'Roles & Permissions' })).toBeNull();
    expect(screen.getAllByRole('link', { name: 'Team' }).length).toBeGreaterThan(0);
  });
});
