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
 * The legacy `role` string each test user's JWT carries alongside its real
 * `roleId`. Every route this test exercises is gated by `requirePermission`
 * (the Slice 3 mechanism under test), but a few use cases still make an
 * additional *internal* check keyed on this legacy string — untouched by
 * Slice 3, since no user existing today can have `roleId` and legacy `role`
 * disagree (see the migration's D2 backfill) and updating them is Slice 5/6
 * follow-on work. Administrator plays BUSINESS_OWNER here for that reason;
 * every other role plays STAFF, which is what a real migrated tenant looks
 * like until a Slice 5/6 admin screen can assign a role independently of it.
 */
const LEGACY_ROLE_FOR: Record<RoleKey, 'BUSINESS_OWNER' | 'STAFF'> = {
  [RoleKey.SalesUser]: 'STAFF',
  [RoleKey.SalesManager]: 'STAFF',
  [RoleKey.Reception]: 'STAFF',
  [RoleKey.Administrator]: 'BUSINESS_OWNER',
  [RoleKey.Ceo]: 'STAFF',
};

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

    // SearchProductsUseCase still requires a legacy-STAFF caller to carry a
    // warehouseId (untouched by Slice 3 — see LEGACY_ROLE_FOR above).
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

      const legacyRole = LEGACY_ROLE_FOR[roleKey];
      const assignedWarehouseId = legacyRole === 'STAFF' ? warehouseId : null;

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
    await prisma.warehouse.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  /** True when `DEFAULT_ROLE_MATRIX[roleKey]` holds `permissionKey` at all. */
  function matrixAllows(roleKey: RoleKey, permissionKey: string): boolean {
    const grants = DEFAULT_ROLE_MATRIX[roleKey] as Readonly<Record<string, PermissionGrant>>;
    return grants[permissionKey] !== undefined;
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
      label: 'invoices.manage — GET /invoices',
      permissionKey: 'invoices.manage',
      request: (t) => request(app).get(`/api/${tenantSlug}/invoices`).set('Authorization', `Bearer ${t}`),
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
