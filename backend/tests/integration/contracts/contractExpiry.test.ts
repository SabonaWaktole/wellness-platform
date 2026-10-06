import request from 'supertest';
import express from 'express';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../../src/main/app';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { PrismaLookupSeeder } from '../../../src/lookups/infrastructure/PrismaLookupSeeder';
import { PrismaPricingSeeder } from '../../../src/pricing/infrastructure/PrismaPricingSeeder';
import { PrismaTenantDeletionTransaction } from '../../../src/tenant/infrastructure/PrismaTenantDeletionTransaction';
import { seedSystemRoles } from '../../support/seedRoles';
import { PrismaSchedulerQueries } from '../../../src/scheduler/PrismaSchedulerQueries';
import { ContractExpiryJob } from '../../../src/scheduler/jobs/ContractExpiryJob';
import { ExpireContractUseCase } from '../../../src/contracts/application/use-cases/ExpireContractUseCase';
import { PrismaContractWriteTransaction } from '../../../src/contracts/infrastructure/PrismaContractWriteTransaction';
import { NotificationService } from '../../../src/notifications/application/NotificationService';
import { PrismaNotificationRepository } from '../../../src/notifications/infrastructure/PrismaNotificationRepository';
import { PrismaPermissionHolderDirectory } from '../../../src/notifications/infrastructure/PrismaPermissionHolderDirectory';
import { PrismaTeamRoster } from '../../../src/access/infrastructure/PrismaTeamRoster';
import { PrismaUserRepository } from '../../../src/auth/infrastructure/repositories/PrismaUserRepository';
import { OPEN_DEAL_STAGES } from '../../../src/deals/domain/DealStage';

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();
const today = () => new Date().toISOString().slice(0, 10);

/**
 * M3 Slice 7 end to end: the system expires an Active contract once its end date
 * has passed (FR-CON-16) and a company with nothing valid or upcoming left becomes
 * a Former client (FR-CON-17), run with a moving clock (NFR-REL-01).
 */

describe('Contract expiry job and company status (M3 Slice 7)', () => {
  const tenantId = `t-contract-expiry-${randomUUID()}`;
  const slug = tenantId;
  const uid = (label: string) => `u-ce-${label}-${randomUUID()}`;
  const users = { admin: uid('admin'), salesA: uid('salesA'), salesB: uid('salesB'), manager: uid('manager'), reception: uid('reception'), ceo: uid('ceo') };
  type Who = keyof typeof users;
  let app: express.Express;
  const tokens = {} as Record<Who, string>;
  const as = (who: Who) => {
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${tokens[who]}`);
    return {
      get: (path: string) => auth(request(app).get(`/api/${slug}${path}`)),
      post: (path: string, body: object = {}) => auth(request(app).post(`/api/${slug}${path}`)).send(body),
      put: (path: string, body: object = {}) => auth(request(app).put(`/api/${slug}${path}`)).send(body),
      patch: (path: string, body: object = {}) => auth(request(app).patch(`/api/${slug}${path}`)).send(body),
      delete: (path: string) => auth(request(app).delete(`/api/${slug}${path}`)),
      upload: (path: string, file: Buffer, filename = 'signed.pdf', contentType = 'application/pdf') =>
        auth(request(app).post(`/api/${slug}${path}`)).attach('file', file, { filename, contentType }),
    };
  };
  const company = { A: randomUUID(), B: randomUUID(), C: randomUUID(), D: randomUUID(), E: randomUUID(), F: randomUUID(), G: randomUUID() };
  let tiranaId: string;
  let areaId: string | null;
  const pdf = (marker = 'one') => Buffer.from(`%PDF-1.4\n% ${marker}\n%%EOF`);

  const wonDeal = async (clientId: string, who: Who = 'salesA'): Promise<string> => {
    const created = await as(who).post('/deals', { clientId, type: 'NEW_CONTRACT' });
    if (created.status !== 201) throw new Error(JSON.stringify(created.body));
    const dealId = created.body.data.id as string;
    const pick = async (model: 'businessType' | 'priceZone' | 'visitFrequency', nameSq: string) =>
      ((await (prisma as any)[model].findFirstOrThrow({ where: { tenantId, nameSq } })) as { id: string }).id;
    const draft = await as(who)
      .put(`/deals/${dealId}/offer`, {
        employees: 2,
        businessTypeId: await pick('businessType', 'Restorant'),
        zoneId: await pick('priceZone', 'Tirana qendër'),
        frequencyId: await pick('visitFrequency', '2 herë në vit'),
        packageId: (await prisma.servicePackage.findFirstOrThrow({ where: { tenantId, isDefault: true } })).id,
      })
      .expect((res) => expect([200, 201]).toContain(res.status));
    const offerId = draft.body.data.id as string;
    await as(who).post(`/offers/${offerId}/mark-ready`, {}).expect(200);
    await as(who).post(`/offers/${offerId}/mark-sent`, { sentDate: today() }).expect(200);
    await as(who).post(`/deals/${dealId}/win`, { offerId, closeFollowUps: false }).expect(200);
    return dealId;
  };
  /** A Draft contract made from a fresh won deal (monthly, 12 months from today). */
  const draft = async (clientId = company.A, who: Who = 'salesA', body: object = {}) => {
    const dealId = await wonDeal(clientId, who);
    return { dealId, contract: (await as(who).post('/contracts', { dealId, ...body }).expect(201)).body };
  };
  const move = (who: Who, id: string, status: string, reason?: string) => as(who).post(`/contracts/${id}/status`, { status, reason });
  const auditCount = (entityType: string, entityId: string) => prisma.auditEntry.count({ where: { tenantId, entityType, entityId } });

  /** Only this tenant: the database is shared with other suites whose contracts must not move. */
  class ThisTenantQueries extends PrismaSchedulerQueries {
    async listTenants() {
      return (await super.listTenants()).filter((tenant) => tenant.id === tenantId);
    }
  }
  const realNotifications = () =>
    new NotificationService(new PrismaNotificationRepository(prisma), new PrismaUserRepository(prisma), undefined, new PrismaPermissionHolderDirectory(prisma, new PrismaTeamRoster(prisma)));
  const jobWith = (notifications: NotificationService = realNotifications()) =>
    new ContractExpiryJob(new ThisTenantQueries(prisma), new ExpireContractUseCase(new PrismaContractWriteTransaction(prisma)), notifications);

  const dayAfter = (date: Date, days: number) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  const noonOf = (date: Date) => new Date(`${date.toISOString().slice(0, 10)}T12:00:00Z`);
  const contractRow = (id: string) => prisma.contract.findUniqueOrThrow({ where: { id } });
  const clientStatus = async (id: string) => (await prisma.client.findUniqueOrThrow({ where: { id } })).status;
  const expiredNotices = (contractId: string) =>
    prisma.notification.findMany({ where: { tenantId, type: 'CONTRACT_EXPIRED', entityType: 'CONTRACT', entityId: contractId } });
  const expiredHistory = (contractId: string) => prisma.contractStatusHistory.findMany({ where: { contractId, toStatus: 'EXPIRED' } });
  const openRenewalDeal = (clientId: string) =>
    prisma.deal.create({
      data: { id: randomUUID(), tenantId, clientId, ownerUserId: users.salesA, createdByUserId: users.salesA, type: 'RENEWAL', stageKey: OPEN_DEAL_STAGES[0] },
    });
  const activeContract = async (clientId: string) => {
    const made = await draft(clientId as typeof company.A);
    await as('salesA').upload(`/contracts/${made.contract.id}/document`, pdf()).expect(200);
    await move('salesA', made.contract.id, 'ACTIVE').expect(200);
    return made.contract.id as string;
  };

  beforeEach(() => jest.restoreAllMocks());

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({ data: { id: tenantId, name: 'Contract lifecycle', urlSlug: slug, salesWorkflow: 'SALES_PROCESS', defaultLanguage: 'sq', timezone: 'Europe/Tirane' } });
    const roles = await seedSystemRoles(prisma, tenantId);
    await new PrismaLookupSeeder(prisma).seed(tenantId);
    await new PrismaPricingSeeder(prisma).seed(tenantId);
    const user = (id: string, roleId: string, firstName: string) => ({
      id, email: `${id}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId, tenantId, firstName, lastName: 'Test',
    });
    await prisma.user.createMany({
      data: [
        user(users.admin, roles[RoleKey.Administrator], 'Ana'),
        user(users.salesA, roles[RoleKey.SalesUser], 'Besa'),
        user(users.salesB, roles[RoleKey.SalesUser], 'Dritan'),
        user(users.manager, roles[RoleKey.SalesManager], 'Erion'),
        user(users.reception, roles[RoleKey.Reception], 'Fatos'),
        user(users.ceo, roles[RoleKey.Ceo], 'Gentian'),
      ],
    });
    for (const who of Object.keys(users) as Who[]) {
      tokens[who] = tokenService.sign({ userId: users[who], role: 'STAFF', tenantId, tenantSlug: slug } as any);
    }
    const restaurant = (await prisma.businessType.findFirstOrThrow({ where: { tenantId, nameSq: 'Restorant' } })).id;
    const tirana = await prisma.city.findFirstOrThrow({ where: { tenantId, nameSq: 'Tiranë' } });
    tiranaId = tirana.id;
    areaId = (tirana as { areaId?: string | null }).areaId ?? null;
    const row = (id: string, name: string, assignedUserId: string) => ({
      id, tenantId, name, assignedUserId, customFieldValues: {}, lastUpdatedByUserId: users.admin,
      employeeCount: 2, businessTypeId: restaurant, cityId: tiranaId, areaId, status: 'PROSPECT',
    });
    await prisma.client.createMany({
      data: (Object.keys(company) as (keyof typeof company)[]).map((key) => row(company[key], `Restorant ${key}`, users.salesA)),
    });
  }, 60_000);

  afterAll(async () => {
    await new PrismaTenantDeletionTransaction(prisma).run(tenantId);
    await prisma.$disconnect();
  });


  it('FR-CON-16 a contract ending yesterday becomes Expired on the next run, by the system, and the salesperson and the Sales Manager are told once', async () => {
    const id = await activeContract(company.A);
    const endsAt = (await contractRow(id)).endsAt;
    const job = jobWith();

    // The day the term ends it is still in force (FR-CON-20).
    await job.run(noonOf(endsAt));
    expect((await contractRow(id)).status).toBe('ACTIVE');

    await job.run(noonOf(dayAfter(endsAt, 1)));
    expect((await contractRow(id)).status).toBe('EXPIRED');
    const history = await expiredHistory(id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ fromStatus: 'ACTIVE', changedByUserId: null });
    expect(await prisma.auditEntry.count({ where: { tenantId, entityType: 'Contract', entityId: id, userId: null, userRole: 'SYSTEM', action: 'STATUS_CHANGE' } })).toBe(1);

    const notices = await expiredNotices(id);
    const recipients = notices.map((n) => n.recipientUserId);
    expect(recipients).toEqual(expect.arrayContaining([users.salesA, users.manager]));
    expect(recipients).not.toContain(users.reception);
    expect(notices.every((n) => n.actorUserId === null)).toBe(true);

    // Twice in a row: nothing more (NFR-REL-01).
    const before = { history: (await expiredHistory(id)).length, notices: notices.length, audits: await auditCount('Contract', id) };
    await job.run(noonOf(dayAfter(endsAt, 1)));
    await job.run(noonOf(dayAfter(endsAt, 2)));
    expect({ history: (await expiredHistory(id)).length, notices: (await expiredNotices(id)).length, audits: await auditCount('Contract', id) }).toEqual(before);
  });

  it('FR-CON-16, NFR-REL-01 after a two-day gap the same final state: one history entry, one notice per recipient', async () => {
    const id = await activeContract(company.B);
    const endsAt = (await contractRow(id)).endsAt;

    await jobWith().run(noonOf(dayAfter(endsAt, 3)));

    expect((await contractRow(id)).status).toBe('EXPIRED');
    expect(await expiredHistory(id)).toHaveLength(1);
    const recipients = (await expiredNotices(id)).map((n) => n.recipientUserId);
    expect(new Set(recipients).size).toBe(recipients.length);
    expect(recipients).toContain(users.salesA);
  });

  it('FR-CON-16 a failing notification does not undo the expiry and is retried on the next run', async () => {
    const id = await activeContract(company.C);
    const endsAt = (await contractRow(id)).endsAt;
    const now = noonOf(dayAfter(endsAt, 1));

    const real = realNotifications();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const failing = jest.spyOn(real, 'emitStrict').mockRejectedValueOnce(new Error('mail down'));
    const job = jobWith(real);

    await job.run(now);
    expect((await contractRow(id)).status).toBe('EXPIRED');
    expect(await expiredNotices(id)).toHaveLength(0);
    expect(await expiredHistory(id)).toHaveLength(1);

    await job.run(now);
    expect(failing).toHaveBeenCalledTimes(2);
    const told = await expiredNotices(id);
    expect(told.length).toBeGreaterThan(0);
    expect(await expiredHistory(id)).toHaveLength(1);

    await job.run(now);
    expect(failing).toHaveBeenCalledTimes(2);
    expect(await expiredNotices(id)).toHaveLength(told.length);
  });

  it('FR-CON-16 nobody is told when a renewal contract exists or a renewal deal is open, but the contract still expires', async () => {
    const renewed = await activeContract(company.D);
    const renewal = (await draft(company.D)).contract.id as string;
    await prisma.contract.update({ where: { id: renewal }, data: { renewedFromContractId: renewed } });

    const negotiated = await activeContract(company.E);
    await openRenewalDeal(company.E);

    const endsAt = (await contractRow(renewed)).endsAt;
    await jobWith().run(noonOf(dayAfter(endsAt, 1)));

    for (const id of [renewed, negotiated]) {
      expect((await contractRow(id)).status).toBe('EXPIRED');
      expect(await expiredNotices(id)).toHaveLength(0);
    }
  });

  it('FR-CON-17 the only contract expiring makes the company a Former client; an open renewal deal keeps it a Client; a new activated contract sets it back', async () => {
    const lone = await activeContract(company.F);
    const negotiating = await activeContract(company.G);
    await openRenewalDeal(company.G);
    expect(await clientStatus(company.F)).toBe('CLIENT');

    const endsAt = (await contractRow(lone)).endsAt;
    await jobWith().run(noonOf(dayAfter(endsAt, 1)));

    expect((await contractRow(lone)).status).toBe('EXPIRED');
    expect(await clientStatus(company.F)).toBe('FORMER_CLIENT');
    expect((await contractRow(negotiating)).status).toBe('EXPIRED');
    expect(await clientStatus(company.G)).toBe('CLIENT');
    // The status change is audited as the system's (FR-AUD-11).
    expect(await prisma.auditEntry.count({ where: { tenantId, entityType: 'Client', entityId: company.F, userRole: 'SYSTEM' } })).toBe(1);

    await activeContract(company.F);
    expect(await clientStatus(company.F)).toBe('CLIENT');
  });

  it('FR-CON-17 another valid contract keeps the company a Client when the first expires', async () => {
    const first = await activeContract(company.A);
    const second = await activeContract(company.A);
    const endsAt = (await contractRow(first)).endsAt;
    await prisma.contract.update({ where: { id: second }, data: { endsAt: dayAfter(endsAt, 400) } });

    await jobWith().run(noonOf(dayAfter(endsAt, 1)));

    expect((await contractRow(first)).status).toBe('EXPIRED');
    expect((await contractRow(second)).status).toBe('ACTIVE');
    expect(await clientStatus(company.A)).toBe('CLIENT');
  });

  it('FR-CON-17 cancelling the last contract makes a Client a Former client; cancelling a Draft that never ran changes nothing', async () => {
    const id = await activeContract(company.B);
    expect(await clientStatus(company.B)).toBe('CLIENT');
    await move('manager', id, 'CANCELLED', 'Closed down').expect(200);
    expect(await clientStatus(company.B)).toBe('FORMER_CLIENT');

    // Winning the deal made the company a Client; a Draft that never ran does not end that.
    const { contract } = await draft(company.C);
    expect(await clientStatus(company.C)).toBe('CLIENT');
    await move('salesA', contract.id, 'CANCELLED', 'Changed their mind').expect(200);
    expect(await clientStatus(company.C)).toBe('CLIENT');
  });
});
