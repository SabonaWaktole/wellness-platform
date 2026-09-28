import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaRoleAdminTransaction } from '../../../src/access/infrastructure/PrismaRoleAdminTransaction';
import { PrismaRoleCatalogue } from '../../../src/access/infrastructure/PrismaRoleCatalogue';
import { PermissionScope } from '../../../src/access/domain/PermissionScope';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { AuditAction } from '../../../src/audit/domain/AuditAction';
import { seedSystemRoles } from '../../support/seedRoles';

const prisma = new PrismaClient();

describe('PrismaRoleAdminTransaction', () => {
  const tenantId = `t-role-admin-${randomUUID()}`;
  const otherTenantId = `t-role-admin-other-${randomUUID()}`;
  const catalogue = new PrismaRoleCatalogue(prisma);
  let roles: Record<RoleKey, string>;
  let otherRoles: Record<RoleKey, string>;

  const audit = (entityId: string) => ({
    tenantId,
    userId: null,
    userRole: 'ADMINISTRATOR',
    action: AuditAction.Update,
    entityType: 'Role',
    entityId,
    entityLabel: 'test',
    changes: [],
  });

  beforeAll(async () => {
    await prisma.tenant.createMany({
      data: [
        { id: tenantId, name: 'Role admin', urlSlug: tenantId },
        { id: otherTenantId, name: 'Role admin other', urlSlug: otherTenantId },
      ],
    });
    roles = await seedSystemRoles(prisma, tenantId);
    otherRoles = await seedSystemRoles(prisma, otherTenantId);
  });

  afterAll(async () => {
    await prisma.auditEntry.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
    await prisma.$disconnect();
  });

  it('FR-RBAC-03 replaces a role\'s grants, scopes included', async () => {
    await new PrismaRoleAdminTransaction(prisma).run(({ roles: writes }) =>
      writes.replaceGrants(tenantId, roles[RoleKey.Reception], { 'companies.view': PermissionScope.Own, 'audit.view': true })
    );

    const reception = await catalogue.findById(tenantId, roles[RoleKey.Reception]);
    expect(reception!.grants).toEqual({ 'companies.view': 'OWN', 'audit.view': true });
  });

  it('never touches another workspace\'s role', async () => {
    await new PrismaRoleAdminTransaction(prisma).run(({ roles: writes }) =>
      writes.replaceGrants(tenantId, otherRoles[RoleKey.Ceo], {})
    );

    const ceo = await catalogue.findById(otherTenantId, otherRoles[RoleKey.Ceo]);
    expect(Object.keys(ceo!.grants).length).toBeGreaterThan(0);
  });

  it('FR-RBAC-04 creates, renames and deletes a custom role', async () => {
    const id = randomUUID();
    const tx = new PrismaRoleAdminTransaction(prisma);

    await tx.run(({ roles: writes }) =>
      writes.create(tenantId, {
        id,
        key: 'CUSTOM_TEST',
        baseKey: RoleKey.SalesUser,
        nameSq: 'Provë',
        nameEn: 'Trial',
        grants: { 'companies.view': PermissionScope.Own, 'users.manage': true },
      })
    );
    expect(await catalogue.findById(tenantId, id)).toMatchObject({
      key: 'CUSTOM_TEST',
      baseKey: RoleKey.SalesUser,
      isSystem: false,
      grants: { 'companies.view': 'OWN', 'users.manage': true },
    });

    await tx.run(({ roles: writes }) => writes.rename(tenantId, id, { nameSq: 'Provë 2', nameEn: 'Trial 2' }));
    expect(await catalogue.findById(tenantId, id)).toMatchObject({ nameSq: 'Provë 2', nameEn: 'Trial 2' });

    await tx.run(({ roles: writes }) => writes.delete(tenantId, id));
    expect(await catalogue.findById(tenantId, id)).toBeNull();
  });

  it('FR-AUD-04 rolls the grant change back when the audit write fails', async () => {
    const before = await catalogue.findById(tenantId, roles[RoleKey.SalesManager]);
    const failingAudit = () => ({ record: jest.fn().mockRejectedValue(new Error('audit down')) });

    await expect(
      new PrismaRoleAdminTransaction(prisma, failingAudit).run(async ({ roles: writes, auditTrail }) => {
        await writes.replaceGrants(tenantId, roles[RoleKey.SalesManager], {});
        await auditTrail.record(audit(roles[RoleKey.SalesManager]));
      })
    ).rejects.toThrow('audit down');

    const after = await catalogue.findById(tenantId, roles[RoleKey.SalesManager]);
    expect(after!.grants).toEqual(before!.grants);
  });

  it('writes the audit entry in the same transaction', async () => {
    await new PrismaRoleAdminTransaction(prisma).run(({ auditTrail }) => auditTrail.record(audit(roles[RoleKey.Ceo])));

    expect(await prisma.auditEntry.count({ where: { tenantId, entityType: 'Role', entityId: roles[RoleKey.Ceo] } })).toBe(1);
  });
});
