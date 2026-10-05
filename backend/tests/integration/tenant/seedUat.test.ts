import { AddressInfo } from 'net';
import { Server } from 'http';
import { randomUUID } from 'crypto';
import request from 'supertest';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../../src/main/app';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { BcryptPasswordHasher } from '../../../src/auth/infrastructure/BcryptPasswordHasher';
import { CreateTenantWithOwnerUseCase } from '../../../src/tenant/application/use-cases/CreateTenantWithOwnerUseCase';
import { PrismaTenantProvisioningTransaction } from '../../../src/tenant/infrastructure/PrismaTenantProvisioningTransaction';
import { PrismaTenantDeletionTransaction } from '../../../src/tenant/infrastructure/PrismaTenantDeletionTransaction';
import { BULK_DEAL_PREFIX, BULK_PREFIX, UAT2_DEAL_COMPANY, UAT2_DEAL_TITLE, UAT_PLANNED_PREFIX, seedUat, SeedUatResult, UAT_COMPANIES, UAT_USERS } from '../../../scripts/uat/seedUat';
import { cookieJwt } from '../../support/cookieJwt';
import { BULK_CONTRACT_PLAN, M3_CONTRACTS, M3_PLAN_PREFIX, SAMPLE_CONTRACT_PDF } from '../../../scripts/uat/seedM3';
import { PrismaSchedulerQueries } from '../../../src/scheduler/PrismaSchedulerQueries';
import { MarkPaymentsOverdueJob } from '../../../src/scheduler/jobs/MarkPaymentsOverdueJob';
import { MarkPaymentOverdueUseCase } from '../../../src/contracts/application/use-cases/MarkPaymentOverdueUseCase';
import { PrismaContractWriteTransaction } from '../../../src/contracts/infrastructure/PrismaContractWriteTransaction';
import { NotificationService } from '../../../src/notifications/application/NotificationService';
import { PrismaNotificationRepository } from '../../../src/notifications/infrastructure/PrismaNotificationRepository';
import { PrismaPermissionHolderDirectory } from '../../../src/notifications/infrastructure/PrismaPermissionHolderDirectory';
import { PrismaTeamRoster } from '../../../src/access/infrastructure/PrismaTeamRoster';
import { PrismaUserRepository } from '../../../src/auth/infrastructure/repositories/PrismaUserRepository';
import { readFileSync } from 'fs';

const prisma = new PrismaClient();

/**
 * The staging seed Milestone 1 UAT runs on (Slice 15). Runs it against a
 * real app on an ephemeral port — the same way `npm run seed:uat` does — and
 * then checks, through the API, that the seeded users and data really let the
 * UAT scenarios run.
 */
describe('UAT seed (Slice 15)', () => {
  const slug = `uat-${randomUUID().slice(0, 8)}`;
  const password = 'UatPassword1';
  let tenantId: string;
  let app: express.Express;
  let server: Server;
  let first: SeedUatResult;
  let second: SeedUatResult;

  const run = () =>
    seedUat({
      prisma,
      tokenService: new JwtTokenService(),
      apiBase: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`,
      tenantSlug: slug,
      password,
      emailDomain: `${slug}.example.com`,
      bulkCompanies: 30,
      bulkDeals: 40,
      bulkFollowUps: 60,
      bulkContracts: 20,
      bulkInstalments: 60,
      bulkActivities: 50,
    });

  const signIn = async (email: string) => {
    const res = await request(app).post(`/api/${slug}/auth/login`).send({ email, password });
    expect(res.status).toBe(200);
    return cookieJwt(res)!;
  };

  beforeAll(async () => {
    const { tenant } = await new CreateTenantWithOwnerUseCase(
      new PrismaTenantProvisioningTransaction(),
      new BcryptPasswordHasher()
    ).execute({ companyName: 'UAT Workspace', urlSlug: slug, ownerEmail: `owner@${slug}.example.com`, ownerPassword: password });
    tenantId = tenant.id;

    app = createApp();
    server = app.listen(0);
    first = await run();
    second = await run();
  }, 120_000);

  afterAll(async () => {
    server?.close();
    if (tenantId) await new PrismaTenantDeletionTransaction(prisma).run(tenantId);
    await prisma.$disconnect();
  });

  it('creates one user per UAT role, the named companies and the bulk companies', () => {
    expect(Object.values(first.users).filter((u) => u.created)).toHaveLength(UAT_USERS.length);
    expect(first.companiesCreated).toBe(UAT_COMPANIES.length);
    expect(first.bulkCreated).toBe(30);
  });

  it('is idempotent: a second run creates nothing', async () => {
    expect(Object.values(second.users).filter((u) => u.created)).toHaveLength(0);
    expect(second.companiesCreated).toBe(0);
    expect(second.bulkCreated).toBe(0);
    expect(second.dealsCreated).toBe(0);
    expect(second.plannedCreated).toBe(0);
    expect(second.bulkDealsCreated).toBe(0);
    expect(second.bulkFollowUpsCreated).toBe(0);
    expect(second.performanceCreated).toBe(0);
    expect(second.m3).toEqual({ exampleDealsCreated: 0, contractsCreated: 0, instalmentsCreated: 0, wonDealsCreated: 0, bulkContractsCreated: 0, bulkInstalmentsCreated: 0, bulkActivitiesCreated: 0 });
    // The named companies, the bulk ones, three of their own for each salesperson's performance data,
    // and the Milestone 3 ones (A, B and the example month's C).
    expect(await prisma.client.count({ where: { tenantId } })).toBe(UAT_COMPANIES.length + 30 + 6 + 3);
    expect(await prisma.client.count({ where: { tenantId, name: { startsWith: BULK_PREFIX } } })).toBe(30);
  });

  it('UAT-6 (M3 Slice 12) gives Sales User A and B three months of activity, deals won and lost, offers and completed follow-ups', async () => {
    expect(first.performanceCreated).toBeGreaterThan(100);
    for (const key of ['salesA', 'salesB'] as const) {
      const userId = first.users[key].id;
      const where = { tenantId, authorUserId: userId, content: { startsWith: 'UAT performance ' } };
      expect(await prisma.interaction.count({ where })).toBeGreaterThan(40);
      const won = await prisma.deal.count({ where: { tenantId, ownerUserId: userId, stageKey: 'WON', title: { startsWith: 'UAT performance ' } } });
      const lost = await prisma.deal.count({ where: { tenantId, ownerUserId: userId, stageKey: 'LOST', title: { startsWith: 'UAT performance ' } } });
      expect([won, lost]).toEqual([5, 7]);
      // Each result has its history row with the owner then (D13).
      expect(await prisma.dealStageHistory.count({ where: { tenantId, ownerUserId: userId, toStage: { in: ['WON', 'LOST'] }, deal: { title: { startsWith: 'UAT performance ' } } } })).toBe(12);
      expect(await prisma.quotation.count({ where: { tenantId, createdByUserId: userId, version: 1 } })).toBe(8);
      expect(await prisma.appointment.count({ where: { tenantId, assignedUserId: userId, kind: 'FOLLOW_UP', status: 'COMPLETED', completedAt: { not: null } } })).toBe(10);
    }
  });

  it('UAT-2 each company of Sales User A or B has one New contract deal, owned by its salesperson', async () => {
    const owned = UAT_COMPANIES.filter((c) => c.owner === 'salesA' || c.owner === 'salesB');
    expect(first.dealsCreated).toBe(owned.length + 1); // plus the second deal below
    for (const spec of owned.filter((c) => c.name !== UAT2_DEAL_COMPANY)) {
      const deals = await prisma.deal.findMany({ where: { tenantId, client: { name: spec.name } } });
      expect(deals).toHaveLength(1);
      expect(deals[0]).toMatchObject({ type: 'NEW_CONTRACT', stageKey: 'NEW_LEAD', ownerUserId: first.users[spec.owner!].id });
    }
  });

  it('UAT-1 has a company of 2 employees, a Medium-risk business type and Tiranë, with a deal for its salesperson', async () => {
    const company = await prisma.client.findFirstOrThrow({
      where: { tenantId, name: 'UAT Restorant Tirana' },
      include: { businessType: { include: { riskLevel: true } }, city: true, deals: true },
    });
    expect(company.employeeCount).toBe(2);
    expect(company.businessType?.riskLevel.level).toBe(2);
    expect(company.city?.nameSq).toBe('Tiranë');
    expect(company.deals).toHaveLength(1);
    expect(company.deals[0].ownerUserId).toBe(first.users.salesA.id);
  });

  it('UAT-2 has a second deal, beside the first, on one company', async () => {
    const deals = await prisma.deal.findMany({ where: { tenantId, client: { name: UAT2_DEAL_COMPANY } } });
    expect(deals).toHaveLength(2);
    expect(deals.some((deal) => deal.title === UAT2_DEAL_TITLE)).toBe(true);
  });

  it('UAT-4 gives Sales User A and B follow-ups and meetings, one follow-up each due yesterday', async () => {
    expect(first.plannedCreated).toBe(8);
    for (const key of ['salesA', 'salesB'] as const) {
      const items = await prisma.appointment.findMany({
        where: { tenantId, assignedUserId: first.users[key].id, notes: { startsWith: UAT_PLANNED_PREFIX } },
      });
      expect(items.map((i) => `${i.kind}/${i.type}`).sort()).toEqual(['FOLLOW_UP/CALL', 'FOLLOW_UP/CALL', 'PLANNED/MEETING', 'PLANNED/ONLINE_MEETING']);
      const overdue = items.filter((i) => i.kind === 'FOLLOW_UP' && i.scheduledAt.getTime() < Date.now());
      expect(overdue).toHaveLength(1);
      expect(items.every((i) => i.dealId)).toBe(true);
    }
  });

  it('UAT-1 and UAT-5 find the seeded pricing configuration and a published script', async () => {
    expect(await prisma.pricingSettings.count({ where: { tenantId } })).toBe(1);
    expect(await prisma.salesScript.count({ where: { tenantId, status: 'PUBLISHED' } })).toBe(1);
  });

  it('NFR-PERF-03 seeds bulk open deals over the bulk companies, each with its first history row', async () => {
    expect(first.bulkDealsCreated).toBe(40);
    const bulk = await prisma.deal.findMany({ where: { tenantId, title: { startsWith: BULK_DEAL_PREFIX } }, include: { stageHistory: true } });
    expect(bulk).toHaveLength(40);
    expect(new Set(bulk.map((deal) => deal.stageKey)).size).toBe(7);
    expect(bulk.every((deal) => deal.stageHistory.length === 1)).toBe(true);
  });

  it('NFR-PERF-03 seeds bulk open follow-ups, due before and after today, on both salespeople', async () => {
    expect(first.bulkFollowUpsCreated).toBe(60);
    const bulk = await prisma.appointment.findMany({ where: { tenantId, kind: 'FOLLOW_UP', notes: { startsWith: 'UAT bulk follow-up ' } } });
    expect(bulk).toHaveLength(60);
    expect(bulk.every((item) => item.status === 'SCHEDULED')).toBe(true);
    expect(bulk.some((item) => item.scheduledAt.getTime() < Date.now())).toBe(true);
    expect(bulk.some((item) => item.scheduledAt.getTime() > Date.now())).toBe(true);
    expect(new Set(bulk.map((item) => item.assignedUserId)).size).toBe(2);
  });

  it('UAT-2 every named company has two contacts, one of them primary', async () => {
    const companies = await prisma.client.findMany({
      where: { tenantId, name: { in: UAT_COMPANIES.map((c) => c.name) } },
      include: { contactPersons: true },
    });
    for (const company of companies) {
      expect(company.contactPersons).toHaveLength(2);
      expect(company.contactPersons.filter((c) => c.isPrimary)).toHaveLength(1);
      expect(company.businessTypeId && company.areaId && company.cityId && company.employeeCount).toBeTruthy();
    }
  });

  it('UAT-1 each seeded user can sign in', async () => {
    for (const user of Object.values(first.users).filter((u) => u.email !== first.users.admin.email)) {
      await signIn(user.email);
    }
  });

  it("UAT-1 Sales User A sees only their own companies and gets 404 for Sales User B's", async () => {
    const token = await signIn(first.users.salesA.email);
    const list = await request(app).get(`/api/${slug}/clients/search?take=100&search=UAT`).set('Cookie', [`jwt=${token}`]);
    expect(list.status).toBe(200);
    const names: string[] = list.body.items.map((c: any) => c.name);
    expect(names).toEqual(expect.arrayContaining(['UAT Kafe Blloku', 'UAT Qendra e Thirrjeve Arta']));
    expect(names).not.toContain('UAT Fabrika Durrës');

    const bCompany = await prisma.client.findFirstOrThrow({ where: { tenantId, name: 'UAT Fabrika Durrës' } });
    const direct = await request(app).get(`/api/${slug}/clients/${bCompany.id}`).set('Cookie', [`jwt=${token}`]);
    expect(direct.status).toBe(404);
  });

  it('UAT-1 Reception sees the contract validity of a seeded contract but no amounts', async () => {
    const token = await signIn(first.users.reception.email);
    const company = await prisma.client.findFirstOrThrow({ where: { tenantId, name: 'UAT Kafe Blloku' } });
    const res = await request(app).get(`/api/${slug}/contracts/client/${company.id}`).set('Cookie', [`jwt=${token}`]);
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).toContain('ACTIVE');
    expect(body).not.toMatch(/"amount"|"paidAmount"|"payments"/);
  });

  it('seeds an active contract with a paid payment for the companies that carry one', async () => {
    const contracts = await prisma.contract.findMany({ where: { tenantId, planName: 'Paketa Wellness UAT' }, include: { payments: true } });
    expect(contracts).toHaveLength(UAT_COMPANIES.filter((c) => c.contract).length);
    for (const contract of contracts) {
      expect(contract.status).toBe('ACTIVE');
      expect(contract.payments.some((p) => p.status === 'PAID')).toBe(true);
    }
  });

  it('UAT-5 the leaver owns companies, so deactivation needs a reassignment', async () => {
    const owned = await prisma.client.count({ where: { tenantId, assignedUserId: first.users.leaver.id } });
    expect(owned).toBe(2);
  });

  describe('Milestone 3 (SRS §9.1, plan Slice 15)', () => {
    const day = (offset: number) => {
      const now = new Date();
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + offset * 24 * 60 * 60 * 1000);
    };
    const named = () => prisma.contract.findMany({ where: { tenantId, planName: { startsWith: M3_PLAN_PREFIX } }, include: { payments: { orderBy: { periodIndex: 'asc' } } } });

    it('UAT-1 gives won deals, and contracts in every status, each from its own won deal with a number', async () => {
      const contracts = await named();
      expect(first.m3.contractsCreated).toBe(M3_CONTRACTS.length);
      expect(new Set(contracts.map((c) => c.status))).toEqual(new Set(['DRAFT', 'PENDING_SIGNATURE', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED']));
      expect(contracts.every((c) => /^CTR-\d{4}-\d{4,}$/.test(c.number ?? ''))).toBe(true);
      const deals = await prisma.deal.findMany({ where: { tenantId, id: { in: contracts.map((c) => c.dealId!) } } });
      expect(deals).toHaveLength(contracts.length);
      expect(deals.every((deal) => deal.stageKey === 'WON' && deal.wonAt)).toBe(true);
    });

    it('UAT-1, UAT-4 a signed contract carries the sample PDF as its current document, and a draft does not', async () => {
      const pdf = readFileSync(SAMPLE_CONTRACT_PDF);
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      for (const contract of await named()) {
        const documents = await prisma.contractDocument.findMany({ where: { contractId: contract.id } });
        const signed = !['DRAFT', 'PENDING_SIGNATURE'].includes(contract.status);
        expect(documents.map((d) => d.isCurrent)).toEqual(signed ? [true] : []);
        expect(Boolean(contract.documentUrl)).toBe(signed);
      }
    });

    it('UAT-2 gives instalments in every payment status, and a receipt row for every amount received', async () => {
      const payments = (await named()).flatMap((c) => c.payments);
      expect(new Set(payments.map((p) => p.status))).toEqual(new Set(['NOT_INVOICED', 'INVOICE_ISSUED', 'PAYMENT_PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE']));
      for (const payment of payments.filter((p) => Number(p.paidAmount) > 0)) {
        const receipts = await prisma.contractPaymentHistory.findMany({ where: { paymentId: payment.id, amountReceived: { gt: 0 } } });
        expect(receipts.reduce((sum, r) => sum + Number(r.amountReceived), 0)).toBeCloseTo(Number(payment.paidAmount), 2);
      }
      expect(payments.filter((p) => p.status === 'PAID').every((p) => p.paidAmount.toString() === p.amount.toString())).toBe(true);
    });

    it('UAT-3 has one Payment Pending and one Not Invoiced instalment due yesterday, on different contracts', async () => {
      const yesterday = day(-1).getTime();
      const due = (await named()).flatMap((c) => c.payments.filter((p) => p.dueDate.getTime() === yesterday).map((p) => ({ status: p.status, contractId: c.id })));
      expect(due.map((d) => d.status).sort()).toEqual(['NOT_INVOICED', 'PAYMENT_PENDING']);
      expect(new Set(due.map((d) => d.contractId)).size).toBe(2);
    });

    it('UAT-3 the daily job makes the pending one Overdue by the system and leaves the Not Invoiced one alone (FR-PAY-09)', async () => {
      class ThisTenant extends PrismaSchedulerQueries {
        async listTenants() {
          return (await super.listTenants()).filter((tenant) => tenant.id === tenantId);
        }
      }
      const notifications = new NotificationService(
        new PrismaNotificationRepository(prisma),
        new PrismaUserRepository(prisma),
        undefined,
        new PrismaPermissionHolderDirectory(prisma, new PrismaTeamRoster(prisma))
      );
      const job = new MarkPaymentsOverdueJob(new ThisTenant(prisma), new MarkPaymentOverdueUseCase(new PrismaContractWriteTransaction(prisma)), notifications);
      const yesterdays = (await named()).flatMap((c) => c.payments).filter((p) => p.dueDate.getTime() === day(-1).getTime());
      const pending = yesterdays.find((p) => p.status === 'PAYMENT_PENDING')!;
      const notInvoiced = yesterdays.find((p) => p.status === 'NOT_INVOICED')!;

      await job.run(new Date());
      expect((await prisma.contractPayment.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe('OVERDUE');
      expect((await prisma.contractPayment.findUniqueOrThrow({ where: { id: notInvoiced.id } })).status).toBe('NOT_INVOICED');
      const history = await prisma.contractPaymentHistory.findFirstOrThrow({ where: { paymentId: pending.id, toStatus: 'OVERDUE' } });
      expect(history.changedByUserId).toBeNull();
    });

    it('UAT-7 has one Active contract ending in 25 days, and one suspended', async () => {
      const contracts = await named();
      const ending = contracts.filter((c) => c.status === 'ACTIVE' && c.endsAt.getTime() === day(25).getTime());
      expect(ending).toHaveLength(1);
      expect(ending[0].assignedUserId).toBe(first.users.salesB.id);
      expect(contracts.filter((c) => c.status === 'SUSPENDED' && c.suspensionReason)).toHaveLength(1);
    });

    it('UAT-5, UAT-6 Sales User C has the SRS example: 4 won deals worth €2,872.80 a year and 6 lost, last month', async () => {
      expect(first.m3.exampleDealsCreated).toBe(10);
      const ownerId = first.users.salesC.id;
      const won = await prisma.deal.findMany({ where: { tenantId, ownerUserId: ownerId, stageKey: 'WON' } });
      expect(won.map((d) => d.agreedAnnualValue!.toFixed(2)).sort()).toEqual(['1200.00', '480.00', '592.80', '600.00']);
      expect(await prisma.deal.count({ where: { tenantId, ownerUserId: ownerId, stageKey: 'LOST' } })).toBe(6);
      const now = new Date();
      const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const closed = await prisma.deal.findMany({ where: { tenantId, ownerUserId: ownerId, closedAt: { not: null } } });
      expect(closed.every((d) => d.closedAt! >= lastMonth && d.closedAt! < thisMonth)).toBe(true);

      const token = await signIn(first.users.manager.email);
      const performance = await request(app).get(`/api/${slug}/performance?preset=LAST_MONTH`).set('Cookie', [`jwt=${token}`]);
      expect(performance.status).toBe(200);
      const row = performance.body.rows.find((r: any) => r.salesperson.id === ownerId);
      expect([row.figures.dealsWon, row.figures.dealsLost, row.figures.totalValue]).toEqual([4, 6, '2872.80']);
    });

    it('UAT-5 the CEO dashboard has figures from the seed, and the Administrator dashboard has none about sales', async () => {
      const ceo = await request(app).get(`/api/${slug}/dashboard/ceo?preset=LAST_MONTH`).set('Cookie', [`jwt=${await signIn(first.users.ceo.email)}`]);
      expect(ceo.status).toBe(200);
      const key = (k: string) => ceo.body.figures.find((f: any) => f.key === k)?.value;
      expect(Number(key('salesValue'))).toBeGreaterThanOrEqual(2872.8);
      expect(Number(key('monthlyRecurringValue'))).toBeGreaterThan(0);
      expect(ceo.body.charts.salesPerMonth.length).toBeGreaterThan(0);

      const adminToken = await signIn(first.users.admin.email);
      const admin = await request(app).get(`/api/${slug}/dashboard/administrator`).set('Cookie', [`jwt=${adminToken}`]);
      expect(admin.status).toBe(200);
      expect(JSON.stringify(admin.body)).not.toMatch(/salesValue|pipelineValue|revenue|monthlyRecurringValue/);
    });

    it('NFR-PERF-04 seeds bulk contracts, instalments and activities on the bulk companies, with a receipt row for what was paid', async () => {
      expect([first.m3.bulkContractsCreated, first.m3.bulkInstalmentsCreated, first.m3.bulkActivitiesCreated]).toEqual([20, 60, 50]);
      expect(await prisma.contract.count({ where: { tenantId, planName: BULK_CONTRACT_PLAN } })).toBe(20);
      const instalments = await prisma.contractPayment.findMany({ where: { tenantId, note: 'UAT bulk instalment' } });
      expect(instalments).toHaveLength(60);
      // Drafts and cancelled contracts carry none.
      const owners = await prisma.contract.findMany({ where: { id: { in: instalments.map((i) => i.contractId) } }, select: { status: true } });
      expect(owners.every((c) => ['ACTIVE', 'EXPIRED', 'SUSPENDED'].includes(c.status))).toBe(true);
      const paid = instalments.filter((i) => Number(i.paidAmount) > 0);
      expect(paid.length).toBeGreaterThan(0);
      expect(await prisma.contractPaymentHistory.count({ where: { paymentId: { in: paid.map((i) => i.id) }, amountReceived: { gt: 0 } } })).toBe(paid.length);
      expect(await prisma.interaction.count({ where: { tenantId, content: { startsWith: 'UAT bulk activity ' } } })).toBe(50);
    });
  });
});
