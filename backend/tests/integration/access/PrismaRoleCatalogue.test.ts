import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaRoleCatalogue } from '../../../src/access/infrastructure/PrismaRoleCatalogue';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { seedSystemRoles } from '../../support/seedRoles';

const prisma = new PrismaClient();

describe('PrismaRoleCatalogue', () => {
  const tenantId = `t-catalogue-${randomUUID()}`;
  const otherTenantId = `t-catalogue-other-${randomUUID()}`;
  const id = (label: string) => `u-catalogue-${label}-${randomUUID()}`;
  const admin = id('admin');
  const inactiveAdmin = id('admin-inactive');
  const deletedAdmin = id('admin-deleted');
  const legacyOwner = id('legacy-owner');
  const legacyStaff = id('legacy-staff');
  const sales = id('sales');
  const otherTenantAdmin = id('other-admin');
  let roles: Record<RoleKey, string>;
  const catalogue = new PrismaRoleCatalogue(prisma);

  beforeAll(async () => {
    await prisma.tenant.createMany({
      data: [
        { id: tenantId, name: 'Catalogue', urlSlug: tenantId },
        { id: otherTenantId, name: 'Catalogue other', urlSlug: otherTenantId },
      ],
    });
    roles = await seedSystemRoles(prisma, tenantId);
    const otherRoles = await seedSystemRoles(prisma, otherTenantId);

    const user = (userId: string, t: string, role: string, roleId: string | null, extra = {}) => ({
      id: userId, email: `${userId}@example.com`, hashedPassword: 'pwd', role, roleId, tenantId: t, ...extra,
    });
    await prisma.user.createMany({
      data: [
        user(admin, tenantId, 'BUSINESS_OWNER', roles[RoleKey.Administrator]),
        user(inactiveAdmin, tenantId, 'BUSINESS_OWNER', roles[RoleKey.Administrator], { isActive: false }),
        user(deletedAdmin, tenantId, 'BUSINESS_OWNER', roles[RoleKey.Administrator], { isActive: false, deletedAt: new Date() }),
        // No roleId yet: D2 maps a legacy BUSINESS_OWNER to Administrator.
        user(legacyOwner, tenantId, 'BUSINESS_OWNER', null),
        user(legacyStaff, tenantId, 'STAFF', null),
        // A legacy BUSINESS_OWNER string with a Sales User roleId: the role wins.
        user(sales, tenantId, 'BUSINESS_OWNER', roles[RoleKey.SalesUser]),
        user(otherTenantAdmin, otherTenantId, 'BUSINESS_OWNER', otherRoles[RoleKey.Administrator]),
      ],
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
    await prisma.$disconnect();
  });

  it('FR-RBAC-08 counts the active users who can manage roles, through their role or the D2 mapping', async () => {
    const holders = await catalogue.activeHolderIds(tenantId, 'roles.manage');

    expect(holders.sort()).toEqual([admin, legacyOwner].sort());
  });

  it('lists the tenant\'s roles with their grants, and only that tenant\'s', async () => {
    const list = await catalogue.list(tenantId);

    expect(list.map((role) => role.id).sort()).toEqual(Object.values(roles).sort());
    const reception = list.find((role) => role.key === RoleKey.Reception)!;
    expect(reception).toMatchObject({ nameEn: 'Reception', isSystem: true });
    expect(reception.grants['notes.add']).toBe('ALL');
  });

  it('finds a role only inside its own tenant', async () => {
    expect(await catalogue.findById(tenantId, roles[RoleKey.Ceo])).toMatchObject({ key: RoleKey.Ceo });
    expect(await catalogue.findById(otherTenantId, roles[RoleKey.Ceo])).toBeNull();
  });
});
