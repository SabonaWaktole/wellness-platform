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

/**
 * Wellness+ routes that carry no login (FR-RBAC-30): the card page and the
 * public verification page are the only two. Each entry needs a reason a
 * reviewer can check. Slices 11 and 13 add them here when they build the
 * routes; any other Wellness+ route must declare one of the nine permissions.
 */
const PUBLIC_WELLNESS_ROUTES: Record<string, string> = {
  'GET /api/public/cards/:token': 'Public: the member card page opens from the QR or the home screen with no login; the 256-bit card token, the per-address rate limit and the allow-list response stand in for authentication (FR-CRD-01, FR-CRD-08).',
  'GET /api/public/cards/:token/manifest.webmanifest': 'Public: the install manifest of one card, so a phone can add it to the home screen; it needs the same card token and the same per-address limit, and a replaced or unknown token gets the neutral not-found (FR-CRD-05, FR-CRD-10).',
  'GET /api/public/verify/:token': 'Public: a partner clinic opens the card QR with an ordinary phone and sees Valid or Not valid with name, member ID, tier and valid-until only; the 256-bit card token, the per-address limit and the allow-list response stand in for authentication, and every reason for not valid gives the same answer (FR-VER-07, FR-VER-09, FR-RBAC-30).',
};

const WELLNESS_PLUS_KEYS = [
  'members.view', 'members.verify', 'members.manage', 'members.payments.view', 'members.payments.record',
  'members.import', 'members.vip.approve', 'members.reports.view', 'wellnessplus.settings.manage',
];

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

  describe('FR-RBAC-30 Wellness+ routes', () => {
    const isWellnessRoute = (path: string) => /\/(members|membership|wellness-plus)(\/|$)/.test(path);

    it('FR-RBAC-30 every public Wellness+ route carries a reason, and there are at most three (the card, its install manifest and verification)', () => {
      for (const [id, reason] of Object.entries(PUBLIC_WELLNESS_ROUTES)) expect([id, reason.length > 10]).toEqual([id, true]);
      expect(Object.keys(PUBLIC_WELLNESS_ROUTES).length).toBeLessThanOrEqual(3);
    });

    it('FR-RBAC-30 every listed public Wellness+ route exists and carries no permission gate', () => {
      const ungated = new Set(routes.filter((route) => route.gate.kind === 'none').map(routeId));
      expect(Object.keys(PUBLIC_WELLNESS_ROUTES).filter((id) => !ungated.has(id))).toEqual([]);
    });

    it('FR-RBAC-30 every Wellness+ tenant route is gated by one of the nine Wellness+ permissions', () => {
      const wrong = tenantRoutes
        .filter((route) => isWellnessRoute(route.path))
        .filter((route) => !(route.gate.kind === 'permission' && route.gate.key.split('|').every((key) => WELLNESS_PLUS_KEYS.includes(key))))
        .map(routeId);
      expect(wrong).toEqual([]);
    });

    it('FR-RBAC-30 no Wellness+ route sits in the general exemption list', () => {
      expect(Object.keys(EXEMPT_ROUTES).filter((id) => isWellnessRoute(id))).toEqual([]);
    });
  });
});
