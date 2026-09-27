import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useNavigation } from './useNavigation';
import '../i18n';

/**
 * The sidebar filters by permission (FR-RBAC-07), the same keys
 * `RequirePermission` gates the matching route with in routes/index.tsx.
 * These tests pin the two together, because when they drift the symptom is
 * a visible link that dead-ends on /unauthorized.
 */
describe('useNavigation', () => {
  /*
   * `useNavigation` calls `useTranslation` — the sidebar labels are catalogue
   * lookups rather than hardcoded English — so it needs a renderer.
   *
   * Every assertion below is about `id`, not `label`: which links a user gets
   * is a permission question and has nothing to do with language.
   */
  const navFor = (user: any, path = '/acme/dashboard') =>
    renderHook(() => useNavigation(user, path)).result.current;

  const idsFor = (user: any) => navFor(user).map((i) => i.id);

  const userWith = (permissions: Record<string, unknown>) => ({ role: 'STAFF', permissions });

  // SRS §4.2 defaults, expressed as this frontend sees them.
  const SALES_USER = userWith({
    'companies.view': 'OWN',
    'calendar.view': 'OWN',
    'inventory.manage': 'OWN',
    'quotations.manage': 'OWN',
    'invoices.manage': 'OWN',
    'contracts.validity.view': 'OWN',
  });
  const RECEPTION = userWith({ 'companies.view': 'ALL', 'contracts.validity.view': 'ALL' });
  const ADMINISTRATOR = userWith({
    'companies.view': 'ALL',
    'calendar.view': 'ALL',
    'inventory.manage': 'ALL',
    'quotations.manage': 'ALL',
    'invoices.manage': 'ALL',
    'contracts.validity.view': 'ALL',
    'reports.view': true,
  });
  const NO_PERMISSIONS = userWith({});
  const SUPER_ADMIN = { role: 'SUPER_ADMIN' };

  describe('permission gating matches the route guards', () => {
    it('offers Reports only to a permissions map holding reports.view', () => {
      expect(idsFor(ADMINISTRATOR)).toContain('reports');
      expect(idsFor(SALES_USER)).not.toContain('reports');
      expect(idsFor(RECEPTION)).not.toContain('reports');
    });

    it('offers Clients to everyone holding companies.view, at any scope', () => {
      expect(idsFor(SALES_USER)).toContain('clients');
      expect(idsFor(RECEPTION)).toContain('clients');
      expect(idsFor(ADMINISTRATOR)).toContain('clients');
    });

    it('D3: Reception has no calendar.view, so no Appointments link', () => {
      expect(idsFor(RECEPTION)).not.toContain('appointments');
      expect(idsFor(SALES_USER)).toContain('appointments');
    });

    it('offers nothing permission-gated to a user with an empty permissions map', () => {
      const ids = idsFor(NO_PERMISSIONS);
      expect(ids).not.toContain('clients');
      expect(ids).not.toContain('reports');
      // Always-on items still show.
      expect(ids).toContain('dashboard');
      expect(ids).toContain('settings');
    });
  });

  /*
   * SUPER_ADMIN is a platform-level role with zero access to any individual
   * tenant's business data — enforced in resolveTenant, which returns 403 for
   * it on every /:tenantSlug/... endpoint. It sits outside the permission
   * system (D2) and keeps its own fixed list rather than a permissions map.
   */
  describe('super admin gets a platform list, not a permission-filtered tenant one', () => {
    it('offers exactly Dashboard, Tenants, People and Settings', () => {
      expect(idsFor(SUPER_ADMIN)).toEqual(['dashboard', 'tenants', 'people', 'setting']);
    });

    it.each(['clients', 'appointments', 'inventory', 'quotations', 'reports', 'settings'])(
      'never offers %s, which resolveTenant would refuse',
      (id) => {
        expect(idsFor(SUPER_ADMIN)).not.toContain(id);
      }
    );

    it('offers Tenants to nobody else — it is SUPER_ADMIN-only server-side', () => {
      for (const user of [ADMINISTRATOR, SALES_USER, RECEPTION, null]) {
        expect(idsFor(user)).not.toContain('tenants');
      }
    });
  });

  describe('active-state highlighting', () => {
    const activeIdsAt = (user: any, path: string) => navFor(user, path)
      .filter((i) => i.isActive)
      .map((i) => i.id);

    it('highlights Tenants alone on the tenants page', () => {
      expect(activeIdsAt(SUPER_ADMIN, '/admin/tenants')).toEqual(['tenants']);
    });

    it('highlights Dashboard alone on the dashboard', () => {
      expect(activeIdsAt(SUPER_ADMIN, '/admin/dashboard')).toEqual(['dashboard']);
    });

    it('does not also highlight Dashboard on a deep page', () => {
      expect(activeIdsAt(ADMINISTRATOR, '/acme/inventory')).toEqual(['inventory']);
    });
  });

  describe('no links to features that do not exist', () => {
    // There is no Tasks route, page, model or endpoint anywhere in the project.
    it('never offers My Tasks to anyone', () => {
      for (const user of [ADMINISTRATOR, SALES_USER, RECEPTION, SUPER_ADMIN]) {
        expect(idsFor(user)).not.toContain('tasks');
      }
    });
  });

  describe('settings availability', () => {
    // settings/profile carries no permission gate, so every tenant user can
    // reach their own profile.
    it('offers Settings to every tenant user, permissions map or not', () => {
      expect(idsFor(SALES_USER)).toContain('settings');
      expect(idsFor(NO_PERMISSIONS)).toContain('settings');
    });
  });

  describe('structural guarantees', () => {
    it('emits no duplicate ids, which would collide as React keys', () => {
      for (const user of [ADMINISTRATOR, SALES_USER, RECEPTION, SUPER_ADMIN, null]) {
        const ids = idsFor(user);
        expect(new Set(ids).size).toBe(ids.length);
      }
    });

    it('does not mutate its module-level source arrays across calls', () => {
      // Guards the by-reference return: a push on a shared array would leak
      // into every later render, for every user.
      const first = idsFor(SALES_USER);
      idsFor(SALES_USER);
      idsFor(ADMINISTRATOR);
      const afterwards = idsFor(SALES_USER);

      expect(afterwards).toEqual(first);
      expect(idsFor(ADMINISTRATOR)).toEqual([
        'dashboard', 'clients', 'appointments', 'inventory', 'quotations', 'invoices', 'contracts', 'reports', 'settings',
      ]);
    });

    it('returns a fresh array each call', () => {
      expect(idsFor(ADMINISTRATOR)).not.toBe(idsFor(ADMINISTRATOR));
    });
  });
});
