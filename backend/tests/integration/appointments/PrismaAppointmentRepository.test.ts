import { PrismaClient } from '@prisma/client';
import { PrismaAppointmentRepository } from '../../../src/appointments/infrastructure/repositories/PrismaAppointmentRepository';
import { Appointment } from '../../../src/appointments/domain/entities/Appointment';
import { AppointmentStatus } from '../../../src/appointments/domain/enums/AppointmentStatus';
import { ClientStatus } from '../../../src/clients/domain/enums/ClientStatus';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

describe('PrismaAppointmentRepository Integration', () => {
  let repo: PrismaAppointmentRepository;
  const tenant1Id = 't-appt-1';
  const tenant2Id = 't-appt-2';
  const user1Id = 'u-appt-1';
  const user2Id = 'u-appt-2';
  const client1Id = 'c-appt-1';
  const client2Id = 'c-appt-2';

  beforeAll(async () => {
    repo = new PrismaAppointmentRepository(prisma);

    await prisma.stockMovement.deleteMany({});
    await prisma.stockLevel.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.warehouse.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.interaction.deleteMany({});
    await prisma.appointment.deleteMany({});
    await prisma.client.deleteMany({});
    await prisma.customFieldDefinition.deleteMany({});
    await prisma.passwordResetToken.deleteMany({});
    await prisma.notification.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.outcomeCategory.deleteMany({});
    await prisma.tenant.deleteMany({});

    await prisma.tenant.createMany({
      data: [
        { id: tenant1Id, name: 'Appt Tenant 1', urlSlug: 't-appt-1' },
        { id: tenant2Id, name: 'Appt Tenant 2', urlSlug: 't-appt-2' },
      ],
      skipDuplicates: true,
    });

    await prisma.user.createMany({
      data: [
        { id: user1Id, email: 'u1@appt.com', hashedPassword: 'pwd', role: 'BUSINESS_OWNER', tenantId: tenant1Id },
        { id: user2Id, email: 'u2@appt.com', hashedPassword: 'pwd', role: 'BUSINESS_OWNER', tenantId: tenant2Id },
      ],
      skipDuplicates: true,
    });

    await prisma.client.createMany({
      data: [
        { id: client1Id, tenantId: tenant1Id, name: 'Client 1', status: ClientStatus.PROSPECT, lastUpdatedByUserId: user1Id, customFieldValues: {} },
        { id: client2Id, tenantId: tenant2Id, name: 'Client 2', status: ClientStatus.PROSPECT, lastUpdatedByUserId: user2Id, customFieldValues: {} },
      ],
      skipDuplicates: true,
    });

    const appointments = [];
    // Seed 5 appointments for Tenant 1
    for (let i = 0; i < 5; i++) {
      appointments.push({
        id: randomUUID(),
        tenantId: tenant1Id,
        clientId: client1Id,
        assignedUserId: user1Id,
        status: AppointmentStatus.SCHEDULED,
        scheduledAt: new Date(Date.now() + i * 10000),
        createdAt: new Date(),
        updatedAt: new Date(Date.now() + i * 10000),
      });
    }

    // Seed 2 appointments for Tenant 2
    for (let i = 0; i < 2; i++) {
      appointments.push({
        id: randomUUID(),
        tenantId: tenant2Id,
        clientId: client2Id,
        assignedUserId: user2Id,
        status: AppointmentStatus.SCHEDULED,
        scheduledAt: new Date(Date.now() + i * 10000),
        createdAt: new Date(),
        updatedAt: new Date(Date.now() + i * 10000),
      });
    }

    await prisma.appointment.createMany({ data: appointments });
  });

  afterAll(async () => {
    await prisma.stockMovement.deleteMany({});
    await prisma.stockLevel.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.warehouse.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.interaction.deleteMany({});
    await prisma.appointment.deleteMany({});
    await prisma.client.deleteMany({});
    await prisma.customFieldDefinition.deleteMany({});
    await prisma.passwordResetToken.deleteMany({});
    await prisma.notification.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.outcomeCategory.deleteMany({});
    await prisma.tenant.deleteMany({ where: { id: { in: [tenant1Id, tenant2Id] } } });
    await prisma.$disconnect();
  });

  it('proves findRecentByTenant correctly isolates by tenantId', async () => {
    const recentT1 = await repo.findRecentByTenant(tenant1Id, 10);
    expect(recentT1.length).toBe(5);
    recentT1.forEach(a => expect(a.tenantId).toBe(tenant1Id));

    const recentT2 = await repo.findRecentByTenant(tenant2Id, 10);
    expect(recentT2.length).toBe(2);
    recentT2.forEach(a => expect(a.tenantId).toBe(tenant2Id));
  });

  it('proves findRecentByTenant respects the limit parameter', async () => {
    const recentT1 = await repo.findRecentByTenant(tenant1Id, 3);
    expect(recentT1.length).toBe(3);
  });

  it('proves findRecentByTenant correctly scopes by assignedUserId', async () => {
    const own = (userId: string) => ({ kind: 'owners' as const, userIds: [userId], includeUnowned: false });
    const scopedT1 = await repo.findRecentByTenant(tenant1Id, 10, own(user1Id));
    expect(scopedT1.length).toBe(5);

    const scopedT1Other = await repo.findRecentByTenant(tenant1Id, 10, own('other-user'));
    expect(scopedT1Other.length).toBe(0);

    // TEAM's "unassigned" branch cannot apply: an appointment always has an assignee.
    const team = await repo.findRecentByTenant(tenant1Id, 10, { kind: 'owners', userIds: [user1Id], includeUnowned: true });
    expect(team.length).toBe(5);
  });

  it('proves findRecentByTenant orders by updatedAt descending', async () => {
    const recentT1 = await repo.findRecentByTenant(tenant1Id, 10);
    for (let i = 0; i < recentT1.length - 1; i++) {
      expect(recentT1[i].updatedAt.getTime()).toBeGreaterThanOrEqual(recentT1[i + 1].updatedAt.getTime());
    }
  });
});
