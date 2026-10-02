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

  it('FR-AUD-06 links to Audit log for a user who can view it', () => {
    renderAs({ 'audit.view': true });

    const links = screen.getAllByRole('link', { name: 'Audit log' });
    expect(links[0].getAttribute('href')).toBe('/acme/settings/audit');
  });

  it('FR-AUD-06 hides it from a user who cannot', () => {
    renderAs({ 'users.manage': true });

    expect(screen.queryByRole('link', { name: 'Audit log' })).toBeNull();
  });

  it('FR-SET-01 links to Lists for a user who manages settings', () => {
    renderAs({ 'settings.manage': true });

    const links = screen.getAllByRole('link', { name: 'Lists' });
    expect(links[0].getAttribute('href')).toBe('/acme/settings/lists');
  });

  it('FR-ACT-03 links to Lists for a user who manages only the activity results', () => {
    renderAs({ 'activityResults.manage': true });

    const links = screen.getAllByRole('link', { name: 'Lists' });
    expect(links[0].getAttribute('href')).toBe('/acme/settings/lists');
  });

  it('FR-SET-01 hides Lists from a user who does not', () => {
    renderAs({ 'users.manage': true, 'audit.view': true });

    expect(screen.queryByRole('link', { name: 'Lists' })).toBeNull();
  });

  it('FR-SET-07 links to Statuses for a user who manages settings', () => {
    renderAs({ 'settings.manage': true });

    const links = screen.getAllByRole('link', { name: 'Statuses' });
    expect(links[0].getAttribute('href')).toBe('/acme/settings/statuses');
  });

  it('FR-SET-07 hides Statuses from a user who does not', () => {
    renderAs({ 'users.manage': true, 'audit.view': true });

    expect(screen.queryByRole('link', { name: 'Statuses' })).toBeNull();
  });

  it('FR-SCR-07 links to Sales script for the Administrator, who edits it, and not for a salesperson, who only reads it', () => {
    renderAs({ 'script.edit': true, 'script.view': true });
    expect(screen.getAllByRole('link', { name: 'Sales script' })[0].getAttribute('href')).toBe('/acme/settings/sales-script');
  });

  it('FR-SCR-07 hides Sales script from a salesperson', () => {
    renderAs({ 'script.view': true, 'users.manage': true });
    expect(screen.queryByRole('link', { name: 'Sales script' })).toBeNull();
  });
});
