import request from 'supertest';
import express from 'express';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../../src/main/app';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { DEFAULT_ROLE_MATRIX, PermissionGrant } from '../../../src/access/domain/DefaultRoleMatrix';
import { RoleKey, SYSTEM_ROLE_NAMES } from '../../../src/access/domain/RoleKey';
import { PermissionScope, scopeAtLeast } from '../../../src/access/domain/PermissionScope';
import { routeTable, RouteEntry } from '../../support/routeTable';
import { PrismaTenantDeletionTransaction } from '../../../src/tenant/infrastructure/PrismaTenantDeletionTransaction';

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();

/**
 * Every test user — the Administrator included — carries the legacy `role`
 * string STAFF, in the database and in its JWT. Nothing may read it any more
 * (FR-RBAC-05: "role names are never compared"): what each user can do comes
 * from its `roleId` alone. If a use case still branched on BUSINESS_OWNER,
 * the Administrator rows below would fail.
 */
const LEGACY_ROLE = 'STAFF';

/**
 * FR-RBAC-01, 05, 09; NFR-SEC-01, 04. For each of the five system roles, every
 * permission-gated tenant route (walked from the live router, so a new route
 * cannot be forgotten) is either allowed or 403'd according to
 * `DEFAULT_ROLE_MATRIX` — the same matrix `generate-role-seed-sql.ts` seeds
 * every tenant with. `routeCoverage.test.ts` makes sure no route escapes the
 * walk by being ungated. The SMOKE cases send real bodies to a few endpoints.
 */
describe('Permission matrix (SRS §4.2)', () => {
  const tenantId = `t-matrix-${randomUUID()}`;
  const tenantSlug = tenantId;
  const roleIds: Record<RoleKey, string> = {} as any;
  const userIds: Record<RoleKey, string> = {} as any;
  const tokens: Record<RoleKey, string> = {} as any;
  let app: express.Express;

  beforeAll(async () => {
    app = createApp();

    await prisma.tenant.create({ data: { id: tenantId, name: 'Matrix Tenant', urlSlug: tenantSlug } });

    // SearchProductsUseCase pins an OWN-scoped inventory.manage caller to
    // their own warehouse, so every test user is given one.
    const warehouseId = `wh-matrix-${randomUUID()}`;
    await prisma.warehouse.create({ data: { id: warehouseId, tenantId, name: 'Matrix Warehouse' } });

    for (const roleKey of Object.values(RoleKey)) {
      const roleId = `role-${roleKey}-${randomUUID()}`;
      const userId = `user-${roleKey}-${randomUUID()}`;
      roleIds[roleKey] = roleId;
      userIds[roleKey] = userId;

      const names = SYSTEM_ROLE_NAMES[roleKey];
      await prisma.role.create({
        data: {
          id: roleId,
          tenantId,
          key: roleKey,
          nameSq: names.nameSq,
          nameEn: names.nameEn,
          isSystem: true,
          updatedAt: new Date(),
          permissions: {
            createMany: {
              data: Object.entries(DEFAULT_ROLE_MATRIX[roleKey]).map(([permissionKey, grant]) => ({
                permissionKey,
                scope: grant === true ? null : (grant as PermissionScope),
              })),
            },
          },
        },
      });

      const legacyRole = LEGACY_ROLE;
      const assignedWarehouseId = warehouseId;

      await prisma.user.create({
        data: {
          id: userId,
          email: `${userId}@example.com`,
          hashedPassword: 'pwd',
          role: legacyRole,
          roleId,
          tenantId,
          warehouseId: assignedWarehouseId,
          isActive: true,
        },
      });

      tokens[roleKey] = tokenService.sign({
        userId,
        role: legacyRole,
        tenantId,
        tenantSlug,
        warehouseId: assignedWarehouseId,
      } as any);
    }
  });

  // The generated cases run every allowed route for real, and some of them
  // create rows (GET /forms/default seeds a form, for one), so the cleanup is
  // the same one that deletes a whole workspace.
  afterAll(async () => {
    await new PrismaTenantDeletionTransaction(prisma).run(tenantId);
    await prisma.$disconnect();
  });

  /**
   * True when `DEFAULT_ROLE_MATRIX[roleKey]` holds `permissionKey` at all, or
   * — for `key:SCOPE` — holds it at exactly that scope.
   */
  function matrixAllows(roleKey: RoleKey, permissionKey: string): boolean {
    const grants = DEFAULT_ROLE_MATRIX[roleKey] as Readonly<Record<string, PermissionGrant>>;
    const [key, scope] = permissionKey.split(':');
    return scope ? grants[key] === scope : grants[key] !== undefined;
  }

  const FAKE_ID = '00000000-0000-4000-8000-000000000000';
  /** Path params the router validates before the gate runs, so a fake value would 404 first. */
  const REAL_PARAMS: Record<string, string> = { list: 'business-types', domain: 'contract', key: 'ACTIVE' };

  /** Whether `role` passes the route's gate, per the same rules as requirePermission.ts. */
  function gateAllows(roleKey: RoleKey, gate: Extract<RouteEntry['gate'], { kind: 'permission' }>): boolean {
    const grants = DEFAULT_ROLE_MATRIX[roleKey] as Readonly<Record<string, PermissionGrant>>;
    return gate.key.split('|').some((key) => {
      const grant = grants[key];
      if (grant === undefined) return false;
      if (!gate.minScope || grant === true) return true;
      return scopeAtLeast(grant as PermissionScope, gate.minScope);
    });
  }

  /**
   * Routes whose permission is not the whole rule: the use case also checks the role the dashboard is for
   * (FR-DSH-01, FR-DSH-02), so a role that holds `deals.view` still gets a 403 for another role's dashboard.
   * The route is allowed only for the roles listed (a role copied from one follows it).
   */
  const ROLE_SPECIFIC: Record<string, readonly RoleKey[]> = {
    'GET /api/:tenantSlug/dashboard/sales-user': [RoleKey.SalesUser],
    'GET /api/:tenantSlug/dashboard/sales-manager': [RoleKey.SalesManager],
    'GET /api/:tenantSlug/dashboard/administrator': [RoleKey.Administrator],
    'GET /api/:tenantSlug/dashboard/ceo': [RoleKey.Ceo],
  };

  const gatedRoutes = routeTable(createApp()).filter(
    (route): route is RouteEntry & { gate: Extract<RouteEntry['gate'], { kind: 'permission' }> } =>
      route.path.startsWith('/api/:tenantSlug/') && route.gate.kind === 'permission'
  );

  describe('NFR-SEC-01, NFR-SEC-04 every gated tenant route, generated from the router, enforced on the server for each role', () => {
    it('covers the routes (guards the walk)', () => {
      expect(gatedRoutes.length).toBeGreaterThan(100);
    });

    for (const route of gatedRoutes) {
      const url = route.path.replace(':tenantSlug', tenantSlug).replace(/:([A-Za-z]+)/g, (_, name: string) => REAL_PARAMS[name] ?? FAKE_ID);
      const label = `${route.method} ${route.path} [${route.gate.key}${route.gate.minScope ? `:${route.gate.minScope}` : ''}]`;
      for (const roleKey of Object.values(RoleKey)) {
        const forRoles = ROLE_SPECIFIC[`${route.method} ${route.path}`];
        const allowed = gateAllows(roleKey, route.gate) && (!forRoles || forRoles.includes(roleKey));
        it(`${label} — ${roleKey} ${allowed ? 'is allowed (not 403)' : 'is forbidden (403)'}`, async () => {
          const method = route.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';
          let req = request(app)[method](url).set('Authorization', `Bearer ${tokens[roleKey]}`);
          if (method !== 'get' && method !== 'delete') req = req.send({});
          const res = await req;
          if (allowed) {
            expect(res.status).not.toBe(403);
          } else {
            expect(res.status).toBe(403);
          }
        });
      }
    }
  });

  const SMOKE: Array<{ label: string; permissionKey: string; request: (t: string) => request.Test }> = [
    {
      label: 'companies.view — GET /clients/search',
      permissionKey: 'companies.view',
      request: (t) => request(app).get(`/api/${tenantSlug}/clients/search`).set('Authorization', `Bearer ${t}`),
    },
    {
      label: 'users.manage — GET /auth/staff/x/deactivation-impact',
      permissionKey: 'users.manage',
      request: (t) =>
        request(app)
          .get(`/api/${tenantSlug}/auth/staff/nonexistent/deactivation-impact`)
          .set('Authorization', `Bearer ${t}`),
    },
    {
      label: 'users.manage — GET /auth/roles',
      permissionKey: 'users.manage',
      request: (t) => request(app).get(`/api/${tenantSlug}/auth/roles`).set('Authorization', `Bearer ${t}`),
    },
    {
      label: 'roles.manage — GET /roles',
      permissionKey: 'roles.manage',
      request: (t) => request(app).get(`/api/${tenantSlug}/roles`).set('Authorization', `Bearer ${t}`),
    },
    {
      label: 'settings.manage — PUT /settings',
      permissionKey: 'settings.manage',
      request: (t) => request(app).put(`/api/${tenantSlug}/settings`).set('Authorization', `Bearer ${t}`).send({}),
    },
    {
      label: 'deals.view — GET /deals/board',
      permissionKey: 'deals.view',
      request: (t) => request(app).get(`/api/${tenantSlug}/deals/board`).set('Authorization', `Bearer ${t}`),
    },
    {
      label: 'commercial.view — GET /offers',
      permissionKey: 'commercial.view',
      request: (t) => request(app).get(`/api/${tenantSlug}/offers`).set('Authorization', `Bearer ${t}`),
    },
    {
      label: 'contracts.validity.view — GET /contracts',
      permissionKey: 'contracts.validity.view',
      request: (t) => request(app).get(`/api/${tenantSlug}/contracts`).set('Authorization', `Bearer ${t}`),
    },
    {
      label: 'quotations.approve — GET /quotations/pending-approvals',
      permissionKey: 'quotations.approve',
      request: (t) =>
        request(app).get(`/api/${tenantSlug}/quotations/pending-approvals`).set('Authorization', `Bearer ${t}`),
    },
    {
      label: 'inventory.manage — GET /inventory/products',
      permissionKey: 'inventory.manage',
      request: (t) => request(app).get(`/api/${tenantSlug}/inventory/products`).set('Authorization', `Bearer ${t}`),
    },
    {
      label: 'reports.view — GET /reports/revenue',
      permissionKey: 'reports.view',
      request: (t) => request(app).get(`/api/${tenantSlug}/reports/revenue`).set('Authorization', `Bearer ${t}`),
    },
    {
      label: 'inventory.manage at ALL — POST /inventory/warehouses',
      permissionKey: 'inventory.manage:ALL',
      request: (t) =>
        request(app)
          .post(`/api/${tenantSlug}/inventory/warehouses`)
          .set('Authorization', `Bearer ${t}`)
          .send({ name: `Matrix WH ${randomUUID()}` }),
    },
    {
      // Read-only since M2 Slice 7: activities take their result from the
      // activity results list.
      label: 'settings.manage — GET /clients/settings/outcome-categories',
      permissionKey: 'settings.manage',
      request: (t) => request(app).get(`/api/${tenantSlug}/clients/settings/outcome-categories`).set('Authorization', `Bearer ${t}`),
    },
    {
      label: 'invoices.manage — GET /invoices',
      permissionKey: 'invoices.manage',
      request: (t) => request(app).get(`/api/${tenantSlug}/invoices`).set('Authorization', `Bearer ${t}`),
    },
    {
      label: 'audit.view — GET /audit',
      permissionKey: 'audit.view',
      request: (t) => request(app).get(`/api/${tenantSlug}/audit`).set('Authorization', `Bearer ${t}`),
    },
    {
      label: 'audit.view — GET /audit/:id',
      permissionKey: 'audit.view',
      request: (t) => request(app).get(`/api/${tenantSlug}/audit/nonexistent`).set('Authorization', `Bearer ${t}`),
    },
    {
      label: 'audit.view — GET /audit/export.csv',
      permissionKey: 'audit.view',
      request: (t) => request(app).get(`/api/${tenantSlug}/audit/export.csv`).set('Authorization', `Bearer ${t}`),
    },
    {
      label: 'settings.manage — POST /lookups/business-types',
      permissionKey: 'settings.manage',
      request: (t) =>
        request(app).post(`/api/${tenantSlug}/lookups/business-types`).set('Authorization', `Bearer ${t}`).send({ nameSq: '', riskLevelId: 'x' }),
    },
    {
      label: 'settings.manage — PATCH /lookups/risk-levels/:id',
      permissionKey: 'settings.manage',
      request: (t) =>
        request(app).patch(`/api/${tenantSlug}/lookups/risk-levels/nonexistent`).set('Authorization', `Bearer ${t}`).send({}),
    },
    {
      label: 'wellnessplus.settings.manage — PATCH /membership/settings',
      permissionKey: 'wellnessplus.settings.manage',
      request: (t) => request(app).patch(`/api/${tenantSlug}/membership/settings`).set('Authorization', `Bearer ${t}`).send({ graceDays: 0 }),
    },
    {
      label: 'wellnessplus.settings.manage — POST /membership/settings/benefits',
      permissionKey: 'wellnessplus.settings.manage',
      request: (t) =>
        request(app).post(`/api/${tenantSlug}/membership/settings/benefits`).set('Authorization', `Bearer ${t}`).send({ nameSq: '', nameEn: '' }),
    },
    {
      label: 'members.view — GET /membership/members',
      permissionKey: 'members.view',
      request: (t) => request(app).get(`/api/${tenantSlug}/membership/members`).set('Authorization', `Bearer ${t}`),
    },
    {
      label: 'members.manage — POST /membership/members',
      permissionKey: 'members.manage',
      request: (t) => request(app).post(`/api/${tenantSlug}/membership/members`).set('Authorization', `Bearer ${t}`).send({ firstName: '', lastName: '' }),
    },
    {
      label: 'members.manage — POST /membership/members/:id/status',
      permissionKey: 'members.manage',
      request: (t) =>
        request(app).post(`/api/${tenantSlug}/membership/members/nonexistent/status`).set('Authorization', `Bearer ${t}`).send({ action: 'CLOSE' }),
    },
    {
      label: 'settings.manage — PATCH /settings/contracts',
      permissionKey: 'settings.manage',
      request: (t) =>
        request(app).patch(`/api/${tenantSlug}/settings/contracts`).set('Authorization', `Bearer ${t}`).send({ expiringSoonDays: 30 }),
    },
    {
      label: 'settings.manage — PATCH /status-labels/contract/:key',
      permissionKey: 'settings.manage',
      request: (t) =>
        request(app)
          .patch(`/api/${tenantSlug}/status-labels/contract/ACTIVE`)
          .set('Authorization', `Bearer ${t}`)
          .send({ labelSq: 'Aktive', colour: '#3DAA6C' }),
    },
  ];

  for (const testCase of SMOKE) {
    describe(testCase.label, () => {
      for (const roleKey of Object.values(RoleKey)) {
        const allowed = matrixAllows(roleKey, testCase.permissionKey);
        it(`${roleKey}: ${allowed ? 'is allowed (not 403)' : 'is forbidden (403)'}`, async () => {
          const res = await testCase.request(tokens[roleKey]);
          if (allowed) {
            expect(res.status).not.toBe(403);
          } else {
            expect(res.status).toBe(403);
          }
        });
      }
    });
  }
});
