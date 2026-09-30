import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaOwnershipTransactions } from '../../../src/auth/infrastructure/PrismaOwnershipTransactions';
import { ResolveAccessContextUseCase } from '../../../src/access/application/use-cases/ResolveAccessContextUseCase';
import { PrismaAccessRepository } from '../../../src/access/infrastructure/PrismaAccessRepository';
import { InMemoryAccessCache } from '../../../src/access/infrastructure/InMemoryAccessCache';
import { IPermissionsChanged } from '../../../src/access/application/ports/IPermissionsChanged';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { seedSystemRoles } from '../../support/seedRoles';

const prisma = new PrismaClient();

/**
 * Since Slice 3, what a user may do comes from `User.roleId`, not the legacy
 * `role` string. The platform's ownership handovers (suspend, reactivate,
 * delete a Business Owner) must therefore move `roleId` with `role`, or a
 * demoted owner keeps every Administrator permission (and a promoted
 * stand-in gets none). Found by the Slice 15 security review.
 */
describe('Ownership handovers move the permission role too (FR-RBAC-01, NFR-SEC-01)', () => {
  const tenantId = `t-own-${randomUUID()}`;
  let roles: Record<RoleKey, string>;
  let ownerId: string;
  let staffId: string;
  const invalidated: string[] = [];
  const signal: IPermissionsChanged = { userChanged: (id) => invalidated.push(id), tenantChanged: () => {} };
  const tx = new PrismaOwnershipTransactions(prisma, signal);

  const roleIdOf = async (userId: string) => (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).roleId;
  const can = async (userId: string, key: string) =>
    (await new ResolveAccessContextUseCase(new PrismaAccessRepository(prisma), new InMemoryAccessCache()).execute({
      userId,
      tenantId,
      legacyRole: 'STAFF',
    })).can(key);

  const suspendOwner = () =>
    tx.promoteForSuspension({
      id: randomUUID(),
      tenantId,
      originalOwnerId: ownerId,
      actingOwnerId: staffId,
      actingOwnerRole: 'STAFF',
      actingOwnerWarehouseId: null,
      createdByUserId: 'platform-admin',
    });

  beforeAll(async () => {
    await prisma.tenant.create({ data: { id: tenantId, name: 'Ownership tenant', urlSlug: tenantId } });
    roles = await seedSystemRoles(prisma, tenantId);
  });

  beforeEach(async () => {
    invalidated.length = 0;
    await prisma.ownershipTransfer.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    ownerId = `owner-${randomUUID()}`;
    staffId = `staff-${randomUUID()}`;
    await prisma.user.createMany({
      data: [
        { id: ownerId, email: `${ownerId}@example.com`, hashedPassword: 'x', role: 'BUSINESS_OWNER', roleId: roles[RoleKey.Administrator], tenantId },
        { id: staffId, email: `${staffId}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId: roles[RoleKey.SalesManager], tenantId },
      ],
    });
  });

  afterAll(async () => {
    await prisma.ownershipTransfer.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: Object.values(roles) } } });
    await prisma.role.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it('suspending the owner gives the stand-in the Administrator role and remembers their old one', async () => {
    const transfer = await suspendOwner();
    expect(await roleIdOf(staffId)).toBe(roles[RoleKey.Administrator]);
    expect(await can(staffId, 'roles.manage')).toBe(true);
    expect((await prisma.ownershipTransfer.findUniqueOrThrow({ where: { id: transfer.id } })).previousActingRoleId).toBe(
      roles[RoleKey.SalesManager]
    );
    expect(invalidated).toEqual(expect.arrayContaining([ownerId, staffId]));
  });

  it('NFR-SEC-01 "keep current ownership" brings the old owner back as a Sales User, without Administrator rights', async () => {
    const transfer = await suspendOwner();
    invalidated.length = 0;
    await tx.keepOwnership(transfer.id, 'platform-admin');

    expect(await roleIdOf(ownerId)).toBe(roles[RoleKey.SalesUser]);
    expect(await can(ownerId, 'roles.manage')).toBe(false);
    expect(await can(ownerId, 'users.manage')).toBe(false);
    expect(invalidated).toContain(ownerId);
  });

  it('"restore original ownership" gives each user back their own role', async () => {
    const transfer = await suspendOwner();
    await tx.restoreOwnership(transfer.id, 'platform-admin');

    expect(await roleIdOf(ownerId)).toBe(roles[RoleKey.Administrator]);
    expect(await roleIdOf(staffId)).toBe(roles[RoleKey.SalesManager]);
    expect(await can(staffId, 'roles.manage')).toBe(false);
  });

  it('"restore" on a transfer made before the role was recorded falls back to the legacy role mapping', async () => {
    const transfer = await suspendOwner();
    await prisma.ownershipTransfer.update({ where: { id: transfer.id }, data: { previousActingRoleId: null } });
    await tx.restoreOwnership(transfer.id, 'platform-admin');

    expect(await roleIdOf(staffId)).toBe(roles[RoleKey.SalesUser]);
  });

  it('"keep both owners" leaves both as Administrators', async () => {
    const transfer = await suspendOwner();
    await tx.keepBothOwners(transfer.id, 'platform-admin');

    expect(await roleIdOf(ownerId)).toBe(roles[RoleKey.Administrator]);
    expect(await roleIdOf(staffId)).toBe(roles[RoleKey.Administrator]);
  });

  it('deleting the owner promotes the stand-in to Administrator', async () => {
    await tx.promoteForDeletion({ actingOwnerId: staffId });
    expect(await roleIdOf(staffId)).toBe(roles[RoleKey.Administrator]);
    expect(await can(staffId, 'users.manage')).toBe(true);
    expect(invalidated).toContain(staffId);
  });
});
