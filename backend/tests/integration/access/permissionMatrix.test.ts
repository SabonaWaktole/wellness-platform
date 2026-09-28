import request from 'supertest';
import express from 'express';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../../src/main/app';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { DEFAULT_ROLE_MATRIX, PermissionGrant } from '../../../src/access/domain/DefaultRoleMatrix';
import { RoleKey, SYSTEM_ROLE_NAMES } from '../../../src/access/domain/RoleKey';
import { PermissionScope } from '../../../src/access/domain/PermissionScope';

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
 * FR-RBAC-01, 05, 09; NFR-SEC-01. For each of the five system roles, exactly
 * one representative endpoint per module either 200s or 403s according to
 * `DEFAULT_ROLE_MATRIX` — the same matrix `generate-role-seed-sql.ts` seeds
 * every tenant with. This is not an exhaustive router walk; it is one load-
 * bearing check per module, chosen so a regression in the matrix or in a
 * route's `requirePermission(...)` call shows up here first.
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

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: Object.values(roleIds) } } });
    await prisma.role.deleteMany({ where: { tenantId } });
    await prisma.outcomeCategory.deleteMany({ where: { tenantId } });
    await prisma.warehouse.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
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

  const CASES: Array<{ label: string; permissionKey: string; request: (t: string) => request.Test }> = [
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
      label: 'settings.manage — POST /clients/settings/outcome-categories (checked in the use case too)',
      permissionKey: 'settings.manage',
      request: (t) =>
        request(app)
          .post(`/api/${tenantSlug}/clients/settings/outcome-categories`)
          .set('Authorization', `Bearer ${t}`)
          .send({ name: `Matrix outcome ${randomUUID()}` }),
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
      label: 'settings.manage — PATCH /status-labels/contract/:key',
      permissionKey: 'settings.manage',
      request: (t) =>
        request(app)
          .patch(`/api/${tenantSlug}/status-labels/contract/ACTIVE`)
          .set('Authorization', `Bearer ${t}`)
          .send({ labelSq: 'Aktive', colour: '#3DAA6C' }),
    },
  ];

  for (const testCase of CASES) {
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
