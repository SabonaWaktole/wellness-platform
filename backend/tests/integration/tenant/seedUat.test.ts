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
    // The named companies, the bulk ones, and three of their own for each salesperson's performance data.
    expect(await prisma.client.count({ where: { tenantId } })).toBe(UAT_COMPANIES.length + 30 + 6);
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
      expect(await prisma.dealStageHistory.count({ where: { tenantId, ownerUserId: userId, toStage: { in: ['WON', 'LOST'] } } })).toBe(12);
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
    const contracts = await prisma.contract.findMany({ where: { tenantId }, include: { payments: true } });
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
});
