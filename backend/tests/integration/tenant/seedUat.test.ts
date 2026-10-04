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
import { BULK_DEAL_PREFIX, BULK_PREFIX, seedUat, SeedUatResult, UAT_COMPANIES, UAT_USERS } from '../../../scripts/uat/seedUat';
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
    expect(second.bulkDealsCreated).toBe(0);
    expect(second.bulkFollowUpsCreated).toBe(0);
    expect(await prisma.client.count({ where: { tenantId } })).toBe(UAT_COMPANIES.length + 30);
    expect(await prisma.client.count({ where: { tenantId, name: { startsWith: BULK_PREFIX } } })).toBe(30);
  });

  it('UAT-2 each company of Sales User A or B has one New contract deal, owned by its salesperson', async () => {
    const owned = UAT_COMPANIES.filter((c) => c.owner === 'salesA' || c.owner === 'salesB');
    expect(first.dealsCreated).toBe(owned.length);
    for (const spec of owned) {
      const deals = await prisma.deal.findMany({ where: { tenantId, client: { name: spec.name } } });
      expect(deals).toHaveLength(1);
      expect(deals[0]).toMatchObject({ type: 'NEW_CONTRACT', stageKey: 'NEW_LEAD', ownerUserId: first.users[spec.owner!].id });
    }
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
