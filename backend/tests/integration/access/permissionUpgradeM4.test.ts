import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { DEFAULT_ROLE_MATRIX, RoleGrantMap } from '../../../src/access/domain/DefaultRoleMatrix';
import { PermissionScope } from '../../../src/access/domain/PermissionScope';
import { PERMISSION_UPGRADES, baselineRoleMatrix, grantsForUpgrade, permissionUpgrade } from '../../../src/access/domain/PermissionUpgrades';
import { RoleKey, SYSTEM_ROLE_NAMES } from '../../../src/access/domain/RoleKey';
import { generatePostgresPermissionUpgradeStatements } from '../../../scripts/generate-role-seed-sql';
import { seedSystemRoles } from '../../support/seedRoles';

const prisma = new PrismaClient();
const { All } = PermissionScope;
const KEY = 'm4-wellness-plus';
const WELLNESS_KEYS = permissionUpgrade(KEY).permissionKeys;

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
 * The Milestone 4 permission upgrade on a workspace as Milestone 3 left it:
 * the Administrator gains the nine Wellness+ keys, Reception "verify" and the
 * CEO the three read keys, once. What the Administrator customised, and copied
 * roles, stay as they were.
 */
describe('m4-wellness-plus permission upgrade (FR-RBAC-26)', () => {
  const tenantId = `t-permupgrade-m4-${randomUUID()}`;
  const roles = {} as Record<RoleKey, string>;
  const copiedRoleId = `r-permupgrade-m4-copy-${randomUUID()}`;
  const customisedReception: RoleGrantMap = { 'companies.view': All, 'notes.view': All };
  const priorUpgrades = PERMISSION_UPGRADES.filter((upgrade) => upgrade.key !== KEY);
  const m3State = (roleKey: RoleKey): RoleGrantMap =>
    priorUpgrades.reduce<RoleGrantMap>((all, upgrade) => ({ ...all, ...grantsForUpgrade(upgrade, roleKey) }), { ...baselineRoleMatrix()[roleKey] });

  beforeAll(async () => {
    await prisma.tenant.create({ data: { id: tenantId, name: 'M4 permission upgrade tenant', urlSlug: tenantId } });
    for (const roleKey of Object.values(RoleKey)) {
      roles[roleKey] = `r-permupgrade-m4-${roleKey}-${randomUUID()}`;
      await prisma.role.create({
        data: {
          id: roles[roleKey],
          tenantId,
          key: roleKey,
          ...SYSTEM_ROLE_NAMES[roleKey],
          isSystem: true,
          permissions: { createMany: { data: rows(roleKey === RoleKey.Reception ? customisedReception : m3State(roleKey)) } },
        },
      });
    }
    await prisma.role.create({
      data: {
        id: copiedRoleId,
        tenantId,
        key: `custom-${randomUUID()}`,
        nameSq: 'Agjent anëtarësie',
        nameEn: 'Membership Agent',
        baseKey: RoleKey.Reception,
        permissions: { createMany: { data: rows(m3State(RoleKey.Reception)) } },
      },
    });
    for (const upgrade of priorUpgrades) await prisma.appliedPermissionUpgrade.create({ data: { tenantId, key: upgrade.key } });
    await runUpgrade();
  });

  afterAll(async () => {
    await prisma.auditEntry.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it('FR-RBAC-26 a customised Reception keeps every grant it had and gains only members.verify', async () => {
    expect(await grantsOf(roles[RoleKey.Reception])).toEqual({ ...customisedReception, 'members.verify': true });
  });

  it('FR-RBAC-26 the other system roles end with the full §10.2 default matrix', async () => {
    for (const roleKey of [RoleKey.SalesUser, RoleKey.SalesManager, RoleKey.Administrator, RoleKey.Ceo]) {
      expect([roleKey, await grantsOf(roles[roleKey])]).toEqual([roleKey, DEFAULT_ROLE_MATRIX[roleKey]]);
    }
    const admin = await grantsOf(roles[RoleKey.Administrator]);
    for (const key of WELLNESS_KEYS) expect([key, admin[key]]).toEqual([key, true]);
    const ceo = await grantsOf(roles[RoleKey.Ceo]);
    expect(WELLNESS_KEYS.filter((key) => ceo[key]).sort()).toEqual(['members.payments.view', 'members.reports.view', 'members.view']);
    for (const roleKey of [RoleKey.SalesUser, RoleKey.SalesManager]) {
      const grants = await grantsOf(roles[roleKey]);
      for (const key of WELLNESS_KEYS) expect([roleKey, key, grants[key]]).toEqual([roleKey, key, undefined]);
    }
  });

  it('FR-RBAC-26 leaves a copied role to the Administrator', async () => {
    const copy = await grantsOf(copiedRoleId);
    for (const key of WELLNESS_KEYS) expect(copy[key]).toBeUndefined();
  });

  it('FR-RBAC-26 writes one Role audit entry per changed role, from the system actor, and records the upgrade', async () => {
    const entries = await prisma.auditEntry.findMany({ where: { tenantId, entityType: 'Role' } });
    expect(entries.map((entry) => entry.entityId).sort()).toEqual(
      [roles[RoleKey.Reception], roles[RoleKey.Administrator], roles[RoleKey.Ceo]].sort()
    );
    const reception = entries.find((entry) => entry.entityId === roles[RoleKey.Reception])!;
    expect(reception).toMatchObject({ userId: null, userRole: 'SYSTEM', action: 'UPDATE' });
    expect(reception.changes).toEqual([
      { field: 'permissionsAdded', old: null, new: ['members.verify'] },
      { field: 'permissionUpgrade', old: null, new: KEY },
    ]);
    expect(await prisma.appliedPermissionUpgrade.count({ where: { tenantId, key: KEY } })).toBe(1);
  });

  it('FR-RBAC-26 running it again changes nothing, and never restores a permission the Administrator revoked', async () => {
    await prisma.rolePermission.delete({
      where: { roleId_permissionKey: { roleId: roles[RoleKey.Administrator], permissionKey: 'members.import' } },
    });
    await prisma.rolePermission.delete({
      where: { roleId_permissionKey: { roleId: roles[RoleKey.Reception], permissionKey: 'members.verify' } },
    });
    const auditBefore = await prisma.auditEntry.count({ where: { tenantId } });

    await runUpgrade();

    expect((await grantsOf(roles[RoleKey.Administrator]))['members.import']).toBeUndefined();
    expect(await grantsOf(roles[RoleKey.Reception])).toEqual(customisedReception);
    expect(await prisma.auditEntry.count({ where: { tenantId } })).toBe(auditBefore);
  });

  it('FR-RBAC-26 a new workspace is born with the full matrix and the ledger row, and the upgrade skips it', async () => {
    const freshId = `t-permupgrade-m4-fresh-${randomUUID()}`;
    await prisma.tenant.create({ data: { id: freshId, name: 'Fresh tenant', urlSlug: freshId } });
    try {
      const fresh = await seedSystemRoles(prisma, freshId);
      await runUpgrade();
      expect(await grantsOf(fresh[RoleKey.Administrator])).toEqual(DEFAULT_ROLE_MATRIX[RoleKey.Administrator]);
      expect(await grantsOf(fresh[RoleKey.Reception])).toEqual(DEFAULT_ROLE_MATRIX[RoleKey.Reception]);
      expect(await prisma.appliedPermissionUpgrade.count({ where: { tenantId: freshId, key: KEY } })).toBe(1);
      expect(await prisma.auditEntry.count({ where: { tenantId: freshId } })).toBe(0);
    } finally {
      await prisma.auditEntry.deleteMany({ where: { tenantId: freshId } });
      await prisma.tenant.deleteMany({ where: { id: freshId } });
    }
  });
});
