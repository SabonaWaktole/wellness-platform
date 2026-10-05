import { createApp } from '../../../src/main/app';
import { catalogueEntry } from '../../../src/access/domain/PermissionCatalogue';
import { routeId, routeTable } from '../../support/routeTable';

const TENANT = '/api/:tenantSlug';

/**
 * Tenant routes that deliberately carry no route-level permission. Adding a
 * route here needs a reason a reviewer can check; anything else under
 * `/api/:tenantSlug` must declare `requirePermission` / `requireAnyPermission`
 * / `requireScope` (FR-RBAC-05: "hiding a menu item in the UI is not enough").
 */
const EXEMPT_ROUTES: Record<string, string> = {
  [`POST ${TENANT}/auth/login`]: 'Public: signs the user in.',
  [`POST ${TENANT}/auth/password-reset/request`]: 'Public: password recovery (rate-limited).',
  [`GET ${TENANT}/lookups/:list`]: 'Any tenant user reads active lookup values; inactive ones need settings.manage (checked in the use case).',
  [`GET ${TENANT}/status-labels/:domain`]: 'Any tenant user needs status labels to render contract and payment badges.',
  [`GET ${TENANT}/settings`]: 'Any tenant user needs workspace language, date format and currency (FR-LNG-04).',
  [`POST ${TENANT}/media/:kind`]: "Personal images are the caller's own; workspace branding is checked against settings.manage in MediaController.authorize.",
  [`DELETE ${TENANT}/media/:kind`]: 'Same guard as POST /media/:kind.',
  [`GET ${TENANT}/dashboard/home`]: 'Every tenant user needs to know which dashboard is theirs after login (FR-DSH-01); it returns only the kind.',
  [`GET ${TENANT}/notifications`]: "The caller's own notifications only.",
  [`GET ${TENANT}/notifications/settings`]: "The caller's own notification preferences.",
  [`PATCH ${TENANT}/notifications/read-all`]: "Marks the caller's own notifications read.",
  [`PATCH ${TENANT}/notifications/:id/read`]: "Marks one of the caller's own notifications read.",
};

describe('Route coverage (NFR-SEC-01)', () => {
  const routes = routeTable(createApp());
  const tenantRoutes = routes.filter((route) => route.path.startsWith(`${TENANT}/`));

  it('finds the tenant routes (guards the router walk itself)', () => {
    expect(tenantRoutes.length).toBeGreaterThan(100);
  });

  it('NFR-SEC-01 every tenant route declares a permission or is explicitly exempt', () => {
    const ungated = tenantRoutes
      .filter((route) => route.gate.kind === 'none')
      .map(routeId)
      .filter((id) => !(id in EXEMPT_ROUTES));
    expect(ungated).toEqual([]);
  });

  it('NFR-SEC-01 has no stale exemption: every exempt route exists and is still ungated', () => {
    const ungatedIds = new Set(tenantRoutes.filter((route) => route.gate.kind === 'none').map(routeId));
    const stale = Object.keys(EXEMPT_ROUTES).filter((id) => !ungatedIds.has(id));
    expect(stale).toEqual([]);
  });

  it('FR-RBAC-05 every declared permission key exists in the catalogue', () => {
    const unknown = tenantRoutes.flatMap((route) =>
      route.gate.kind === 'permission'
        ? route.gate.key.split('|').filter((key) => !catalogueEntry(key)).map((key) => `${routeId(route)} → ${key}`)
        : []
    );
    expect(unknown).toEqual([]);
  });

  it('FR-RBAC-05 no tenant route is gated by a role name', () => {
    expect(tenantRoutes.filter((route) => route.gate.kind === 'roles').map(routeId)).toEqual([]);
  });
});
