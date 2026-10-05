import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { DEFAULT_ROLE_MATRIX, RoleGrantMap } from '../../../src/access/domain/DefaultRoleMatrix';
import { PermissionScope } from '../../../src/access/domain/PermissionScope';
import { PERMISSION_UPGRADES, baselineRoleMatrix, grantsForUpgrade, permissionUpgrade } from '../../../src/access/domain/PermissionUpgrades';
import { RoleKey, SYSTEM_ROLE_NAMES } from '../../../src/access/domain/RoleKey';
import { generatePostgresPermissionUpgradeStatements } from '../../../scripts/generate-role-seed-sql';
import { seedSystemRoles } from '../../support/seedRoles';

const prisma = new PrismaClient();
const { Own, Team, All } = PermissionScope;
const salesKeys = permissionUpgrade('m2-sales').permissionKeys;

const rows = (grants: RoleGrantMap) =>
  Object.entries(grants).map(([permissionKey, grant]) => ({
    permissionKey,
    scope: grant === true ? null : grant,
  }));

/** The statements the m2-sales migration runs, executed exactly as committed. */
async function runUpgrade(): Promise<void> {
  for (const statement of generatePostgresPermissionUpgradeStatements('m2-sales')) {
    await prisma.$executeRawUnsafe(statement);
  }
}

async function grantsOf(roleId: string): Promise<Record<string, string | true>> {
  const permissions = await prisma.rolePermission.findMany({
    where: { roleId },
  });
  return Object.fromEntries(permissions.map((p) => [p.permissionKey, p.scope ?? true]));
}

/**
 * The Milestone 2 permission upgrade on a workspace as Milestone 1 left it
 * (plan D7): system roles gain the §9.2 sales defaults once; what the
 * Administrator customised, and copied roles, stay exactly as they were.
 */
describe('m2-sales permission upgrade (FR-RBAC-16)', () => {
  const tenantId = `t-permupgrade-${randomUUID()}`;
  const roles = {} as Record<RoleKey, string>;
  const copiedRoleId = `r-permupgrade-copy-${randomUUID()}`;
  const customisedReception: RoleGrantMap = {
    'companies.view': All,
    'notes.view': All,
    'activities.view': All,
  };

  beforeAll(async () => {
    await prisma.tenant.create({
      data: {
        id: tenantId,
        name: 'Permission upgrade tenant',
        urlSlug: tenantId,
      },
    });
    // Milestone 1 state: the baseline matrix, no ledger row.
    const baseline = baselineRoleMatrix();
    for (const roleKey of Object.values(RoleKey)) {
      roles[roleKey] = `r-permupgrade-${roleKey}-${randomUUID()}`;
      await prisma.role.create({
        data: {
          id: roles[roleKey],
          tenantId,
          key: roleKey,
          ...SYSTEM_ROLE_NAMES[roleKey],
          isSystem: true,
          permissions: {
            createMany: {
              data: rows(roleKey === RoleKey.Reception ? customisedReception : baseline[roleKey]),
            },
          },
        },
      });
    }
    await prisma.role.create({
      data: {
        id: copiedRoleId,
        tenantId,
        key: `custom-${randomUUID()}`,
        nameSq: 'Shitës i ri',
        nameEn: 'Junior sales',
        baseKey: RoleKey.SalesUser,
        permissions: {
          createMany: { data: rows(baseline[RoleKey.SalesUser]) },
        },
      },
    });

    await runUpgrade();
  });

  afterAll(async () => {
    await prisma.auditEntry.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it('FR-RBAC-16 a customised Reception keeps its customisation and gets no sales permission', async () => {
    expect(await grantsOf(roles[RoleKey.Reception])).toEqual(customisedReception);
  });

  it('FR-RBAC-16 every other system role ends with the full §9.2 default matrix', async () => {
    for (const roleKey of [RoleKey.SalesUser, RoleKey.SalesManager, RoleKey.Administrator, RoleKey.Ceo]) {
      // The m3-contracts-payments keys come from the later upgrade, which this suite does not run.
      expect([roleKey, await grantsOf(roles[roleKey])]).toEqual([
        roleKey,
        { ...baselineRoleMatrix()[roleKey], ...grantsForUpgrade(permissionUpgrade('m2-sales'), roleKey) },
      ]);
    }
    const salesUser = await grantsOf(roles[RoleKey.SalesUser]);
    expect(salesUser['deals.view']).toBe(Own);
    expect((await grantsOf(roles[RoleKey.SalesManager]))['discounts.approve']).toBe(Team);
    expect((await grantsOf(roles[RoleKey.Ceo]))['discounts.approve']).toBe(All);
    expect((await grantsOf(roles[RoleKey.Administrator]))['discounts.approve']).toBeUndefined();
  });

  it('FR-RBAC-16 leaves a copied role to the Administrator', async () => {
    const copied = await grantsOf(copiedRoleId);
    expect(copied).toEqual(baselineRoleMatrix()[RoleKey.SalesUser]);
    for (const key of salesKeys) expect(copied[key]).toBeUndefined();
  });

  it('FR-RBAC-16 writes one Role audit entry per changed role, from the system actor, and records the upgrade', async () => {
    const entries = await prisma.auditEntry.findMany({
      where: { tenantId, entityType: 'Role' },
    });
    expect(entries.map((entry) => entry.entityId).sort()).toEqual(
      [roles[RoleKey.SalesUser], roles[RoleKey.SalesManager], roles[RoleKey.Administrator], roles[RoleKey.Ceo]].sort()
    );
    const ceo = entries.find((entry) => entry.entityId === roles[RoleKey.Ceo])!;
    expect(ceo).toMatchObject({
      userId: null,
      userRole: 'SYSTEM',
      action: 'UPDATE',
      entityLabel: 'CEO',
    });
    expect(ceo.changes).toEqual([
      {
        field: 'permissionsAdded',
        old: null,
        new: ['deals.view', 'discounts.approve', 'script.view'],
      },
      { field: 'permissionUpgrade', old: null, new: 'm2-sales' },
    ]);
    expect(
      await prisma.appliedPermissionUpgrade.count({
        where: { tenantId, key: 'm2-sales' },
      })
    ).toBe(1);
  });

  it('FR-RBAC-16 running the upgrade again changes nothing, and never restores a key the Administrator revoked', async () => {
    await prisma.rolePermission.delete({
      where: {
        roleId_permissionKey: {
          roleId: roles[RoleKey.SalesManager],
          permissionKey: 'deals.delete',
        },
      },
    });
    const auditBefore = await prisma.auditEntry.count({ where: { tenantId } });

    await runUpgrade();

    expect((await grantsOf(roles[RoleKey.SalesManager]))['deals.delete']).toBeUndefined();
    expect(await grantsOf(roles[RoleKey.Reception])).toEqual(customisedReception);
    expect(await prisma.auditEntry.count({ where: { tenantId } })).toBe(auditBefore);
  });

  it('FR-RBAC-16 a new workspace is born with the full matrix and the upgrade already recorded', async () => {
    const freshId = `t-permupgrade-fresh-${randomUUID()}`;
    await prisma.tenant.create({
      data: { id: freshId, name: 'Fresh tenant', urlSlug: freshId },
    });
    try {
      const fresh = await seedSystemRoles(prisma, freshId);
      await runUpgrade();
      expect(await grantsOf(fresh[RoleKey.SalesManager])).toEqual(DEFAULT_ROLE_MATRIX[RoleKey.SalesManager]);
      expect(
        await prisma.appliedPermissionUpgrade.count({
          where: { tenantId: freshId },
        })
      ).toBe(PERMISSION_UPGRADES.length);
      expect(await prisma.auditEntry.count({ where: { tenantId: freshId } })).toBe(0);
    } finally {
      await prisma.auditEntry.deleteMany({ where: { tenantId: freshId } });
      await prisma.tenant.deleteMany({ where: { id: freshId } });
    }
  });
});
