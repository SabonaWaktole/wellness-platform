import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaTeamRoster } from '../../../src/access/infrastructure/PrismaTeamRoster';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { seedSystemRoles } from '../../support/seedRoles';

const prisma = new PrismaClient();

describe('PrismaTeamRoster', () => {
  const tenantId = `t-roster-${randomUUID()}`;
  const otherTenantId = `t-roster-other-${randomUUID()}`;
  const id = (label: string) => `u-roster-${label}-${randomUUID()}`;
  const salesUser = id('sales');
  const inactiveSalesUser = id('sales-inactive');
  const legacyStaff = id('legacy-staff');
  const manager = id('manager');
  const legacyOwner = id('legacy-owner');
  const otherTenantSales = id('other-sales');

  beforeAll(async () => {
    await prisma.tenant.createMany({
      data: [
        { id: tenantId, name: 'Roster', urlSlug: tenantId },
        { id: otherTenantId, name: 'Roster other', urlSlug: otherTenantId },
      ],
    });
    const roles = await seedSystemRoles(prisma, tenantId);
    const otherRoles = await seedSystemRoles(prisma, otherTenantId);

    const user = (userId: string, t: string, role: string, roleId: string | null, isActive = true) => ({
      id: userId, email: `${userId}@example.com`, hashedPassword: 'pwd', role, roleId, tenantId: t, isActive,
    });
    await prisma.user.createMany({
      data: [
        user(salesUser, tenantId, 'STAFF', roles[RoleKey.SalesUser]),
        user(inactiveSalesUser, tenantId, 'STAFF', roles[RoleKey.SalesUser], false),
        // No roleId yet: D2 maps legacy STAFF to Sales User.
        user(legacyStaff, tenantId, 'STAFF', null),
        // Legacy STAFF string, but assigned the Sales Manager role: roleId wins.
        user(manager, tenantId, 'STAFF', roles[RoleKey.SalesManager]),
        user(legacyOwner, tenantId, 'BUSINESS_OWNER', null),
        user(otherTenantSales, otherTenantId, 'STAFF', otherRoles[RoleKey.SalesUser]),
      ],
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
    await prisma.$disconnect();
  });

  it('FR-RBAC-12 lists every Sales User of the tenant, active or not, by role', async () => {
    const ids = await new PrismaTeamRoster(prisma).salesUserIds(tenantId);

    expect(ids.sort()).toEqual([salesUser, inactiveSalesUser, legacyStaff].sort());
  });
});
