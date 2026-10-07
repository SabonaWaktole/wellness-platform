import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { DEFAULT_ROLE_MATRIX, RoleGrantMap } from '../../../src/access/domain/DefaultRoleMatrix';
import { PermissionScope } from '../../../src/access/domain/PermissionScope';
import { baselineRoleMatrix, grantsForUpgrade, permissionUpgrade } from '../../../src/access/domain/PermissionUpgrades';
import { RoleKey, SYSTEM_ROLE_NAMES } from '../../../src/access/domain/RoleKey';
import { generatePostgresPermissionUpgradeStatements } from '../../../scripts/generate-role-seed-sql';
import { seedSystemRoles } from '../../support/seedRoles';

const prisma = new PrismaClient();
const { Team, All } = PermissionScope;
const KEY = 'm3-contracts-payments';

const rows = (grants: RoleGrantMap) =>
  Object.entries(grants).map(([permissionKey, grant]) => ({ permissionKey, scope: grant === true ? null : grant }));

async function runUpgrade(): Promise<void> {
  for (const statement of generatePostgresPermissionUpgradeStatements(KEY)) {
    await prisma.$executeRawUnsafe(statement);
  }
}

async function grantsOf(roleId: string): Promise<Record<string, string | true>> {
  const permissions = await prisma.rolePermission.findMany({ where: { roleId } });
  return Object.fromEntries(permissions.map((p) => [p.permissionKey, p.scope ?? true]));
}

/**
 * The Milestone 3 permission upgrade on a workspace as Milestone 2 left it:
 * system roles gain "Contracts: suspend, cancel, reinstate" once; what the
 * Administrator customised, and copied roles, stay as they were.
 */
describe('m3-contracts-payments permission upgrade (FR-RBAC-20)', () => {
  const tenantId = `t-permupgrade-m3-${randomUUID()}`;
  const roles = {} as Record<RoleKey, string>;
  const copiedRoleId = `r-permupgrade-m3-copy-${randomUUID()}`;
  const customisedReception: RoleGrantMap = { 'companies.view': All, 'notes.view': All };
  const m2 = permissionUpgrade('m2-sales');
  const m2State = (roleKey: RoleKey): RoleGrantMap => ({ ...baselineRoleMatrix()[roleKey], ...grantsForUpgrade(m2, roleKey) });

  beforeAll(async () => {
    await prisma.tenant.create({ data: { id: tenantId, name: 'M3 permission upgrade tenant', urlSlug: tenantId } });
    for (const roleKey of Object.values(RoleKey)) {
      roles[roleKey] = `r-permupgrade-m3-${roleKey}-${randomUUID()}`;
      await prisma.role.create({
        data: {
          id: roles[roleKey],
          tenantId,
          key: roleKey,
          ...SYSTEM_ROLE_NAMES[roleKey],
          isSystem: true,
          permissions: { createMany: { data: rows(roleKey === RoleKey.Reception ? customisedReception : m2State(roleKey)) } },
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
        baseKey: RoleKey.SalesManager,
        permissions: { createMany: { data: rows(m2State(RoleKey.SalesManager)) } },
      },
    });
    await prisma.appliedPermissionUpgrade.create({ data: { tenantId, key: 'm2-sales' } });
    await runUpgrade();
  });

  afterAll(async () => {
    await prisma.auditEntry.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it('FR-RBAC-20 a customised Reception keeps its customisation and gets no commercial permission', async () => {
    expect(await grantsOf(roles[RoleKey.Reception])).toEqual(customisedReception);
  });

  it('FR-RBAC-20 the other system roles end with the full §7.2 default matrix', async () => {
    for (const roleKey of [RoleKey.SalesUser, RoleKey.SalesManager, RoleKey.Administrator, RoleKey.Ceo]) {
      // The m4-wellness-plus keys come from the later upgrade, which this suite does not run.
      expect([roleKey, await grantsOf(roles[roleKey])]).toEqual([
        roleKey,
        { ...m2State(roleKey), ...grantsForUpgrade(permissionUpgrade(KEY), roleKey) },
      ]);
    }
    expect((await grantsOf(roles[RoleKey.SalesManager]))['contracts.terminate']).toBe(Team);
    expect((await grantsOf(roles[RoleKey.Administrator]))['contracts.terminate']).toBe(All);
    expect((await grantsOf(roles[RoleKey.SalesUser]))['contracts.terminate']).toBeUndefined();
  });

  it('FR-RBAC-20 leaves a copied role to the Administrator', async () => {
    expect((await grantsOf(copiedRoleId))['contracts.terminate']).toBeUndefined();
  });

  it('FR-RBAC-20 writes one Role audit entry per changed role, from the system actor, and records the upgrade', async () => {
    const entries = await prisma.auditEntry.findMany({ where: { tenantId, entityType: 'Role' } });
    expect(entries.map((entry) => entry.entityId).sort()).toEqual(
      [roles[RoleKey.SalesManager], roles[RoleKey.Administrator]].sort()
    );
    const manager = entries.find((entry) => entry.entityId === roles[RoleKey.SalesManager])!;
    expect(manager).toMatchObject({ userId: null, userRole: 'SYSTEM', action: 'UPDATE' });
    expect(manager.changes).toEqual([
      { field: 'permissionsAdded', old: null, new: ['contracts.terminate'] },
      { field: 'permissionUpgrade', old: null, new: KEY },
    ]);
    expect(await prisma.appliedPermissionUpgrade.count({ where: { tenantId, key: KEY } })).toBe(1);
  });

  it('FR-RBAC-20 running it again changes nothing, and never restores a permission the Administrator revoked', async () => {
    await prisma.rolePermission.delete({
      where: { roleId_permissionKey: { roleId: roles[RoleKey.SalesManager], permissionKey: 'contracts.terminate' } },
    });
    const auditBefore = await prisma.auditEntry.count({ where: { tenantId } });

    await runUpgrade();

    expect((await grantsOf(roles[RoleKey.SalesManager]))['contracts.terminate']).toBeUndefined();
    expect(await grantsOf(roles[RoleKey.Reception])).toEqual(customisedReception);
    expect(await prisma.auditEntry.count({ where: { tenantId } })).toBe(auditBefore);
  });

  it('FR-RBAC-20 a new workspace is born with the full matrix and the ledger row, and the upgrade skips it', async () => {
    const freshId = `t-permupgrade-m3-fresh-${randomUUID()}`;
    await prisma.tenant.create({ data: { id: freshId, name: 'Fresh tenant', urlSlug: freshId } });
    try {
      const fresh = await seedSystemRoles(prisma, freshId);
      await runUpgrade();
      expect(await grantsOf(fresh[RoleKey.Administrator])).toEqual(DEFAULT_ROLE_MATRIX[RoleKey.Administrator]);
      expect(await prisma.appliedPermissionUpgrade.count({ where: { tenantId: freshId, key: KEY } })).toBe(1);
      expect(await prisma.auditEntry.count({ where: { tenantId: freshId } })).toBe(0);
    } finally {
      await prisma.auditEntry.deleteMany({ where: { tenantId: freshId } });
      await prisma.tenant.deleteMany({ where: { id: freshId } });
    }
  });
});
