import request from 'supertest';
import express from 'express';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../../src/main/app';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { PrismaTenantDeletionTransaction } from '../../../src/tenant/infrastructure/PrismaTenantDeletionTransaction';
import { seedSystemRoles } from '../../support/seedRoles';

// Each check takes the fastest of three requests, so a screen well inside its 2 second budget can still take
// more than Jest's default 5 seconds to measure, more so when the whole suite is running at once.
jest.setTimeout(30_000);

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();

/**
 * NFR-PERF-04: the Performance screen and the four dashboards load in under 2 seconds at the volume of the SRS (2,000 deals,
 * 5,000 activities, and as many follow-ups) for the whole sales team, with the comparison, the
 * drill-down and the series. This runs on the test database, which is smaller than staging, so it is a
 * guard against a query that stops using its index, not the staging measurement
 * (`scripts/measure-performance.ts` does that).
 */
describe('Performance screen at volume (NFR-PERF-04)', () => {
  const tenantId = `t-perfvol-${randomUUID()}`;
  const slug = tenantId;
  const manager = `u-pv-manager-${randomUUID()}`;
  const sellers = Array.from({ length: 6 }, (_, i) => `u-pv-sales${i}-${randomUUID()}`);
  const ceo = `u-pv-ceo-${randomUUID()}`;
  const admin = `u-pv-admin-${randomUUID()}`;
  let app: express.Express;
  let token: string;
  let sellerToken: string;
  let ceoToken: string;
  let adminToken: string;
  const get = (path: string, bearer?: string) => request(app).get(`/api/${slug}${path}`).set('Authorization', `Bearer ${bearer ?? token}`);

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({ data: { id: tenantId, name: 'Volume tenant', urlSlug: slug, timezone: 'Europe/Tirane' } });
    const roles = await seedSystemRoles(prisma, tenantId);
    await prisma.user.createMany({
      data: [
        { id: manager, roleId: roles[RoleKey.SalesManager] },
        { id: ceo, roleId: roles[RoleKey.Ceo] },
        { id: admin, roleId: roles[RoleKey.Administrator] },
        ...sellers.map((id) => ({ id, roleId: roles[RoleKey.SalesUser] })),
      ].map(({ id, roleId }) => ({ id, email: `${id}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId, tenantId, firstName: id.slice(5, 14), lastName: 'Vol' })),
    });
    token = tokenService.sign({ userId: manager, role: 'STAFF', tenantId, tenantSlug: slug } as any);
    sellerToken = tokenService.sign({ userId: sellers[0], role: 'STAFF', tenantId, tenantSlug: slug } as any);
    ceoToken = tokenService.sign({ userId: ceo, role: 'STAFF', tenantId, tenantSlug: slug } as any);
    adminToken = tokenService.sign({ userId: admin, role: 'STAFF', tenantId, tenantSlug: slug } as any);

    const companyIds = Array.from({ length: 200 }, () => randomUUID());
    await prisma.client.createMany({
      data: companyIds.map((id, i) => ({ id, tenantId, name: `Volume ${i}`, status: 'CLIENT', customFieldValues: {}, lastUpdatedByUserId: manager, assignedUserId: sellers[i % sellers.length] })) as any,
    });

    const day = 86_400_000;
    const now = Date.now();
    const pick = <T,>(items: T[], n: number) => items[n % items.length];
    const channels = ['CALL', 'EMAIL', 'VISIT', 'MEETING', 'ONLINE_MEETING', 'NOTE'];
    const chunks = async <T,>(rows: T[], write: (batch: T[]) => Promise<unknown>) => {
      for (let i = 0; i < rows.length; i += 2_000) await write(rows.slice(i, i + 2_000));
    };

    await chunks(
      Array.from({ length: 5_000 }, (_, n) => ({
        id: randomUUID(), tenantId, clientId: pick(companyIds, n), authorUserId: pick(sellers, n), channel: pick(channels, n), content: 'x',
        occurredAt: new Date(now - (n % 300) * day),
      })),
      (data) => prisma.interaction.createMany({ data: data as any })
    );
    const deals = Array.from({ length: 2_000 }, (_, n) => {
      const status = n % 3 === 0 ? 'WON' : n % 3 === 1 ? 'LOST' : 'NEGOTIATION';
      const at = new Date(Math.floor((now - (n % 300) * day) / day) * day);
      return {
        id: randomUUID(), tenantId, clientId: pick(companyIds, n), ownerUserId: pick(sellers, n), createdByUserId: manager, type: 'NEW_CONTRACT', stageKey: status,
        createdAt: new Date(at.getTime() - 20 * day),
        ...(status === 'WON' ? { wonAt: at, agreedAnnualValue: '592.80' } : status === 'LOST' ? { lostAt: at } : {}),
      };
    });
    await chunks(deals, (data) => prisma.deal.createMany({ data: data as any }));
    await chunks(
      deals.filter((deal) => deal.stageKey !== 'NEGOTIATION'),
      (data) =>
        prisma.dealStageHistory.createMany({
          data: data.map((deal) => ({ id: randomUUID(), tenantId, dealId: deal.id, toStage: deal.stageKey, ownerUserId: deal.ownerUserId, at: (deal as any).wonAt ?? (deal as any).lostAt })),
        })
    );
    await chunks(
      Array.from({ length: 5_000 }, (_, n) => ({
        id: randomUUID(), tenantId, clientId: pick(companyIds, n), assignedUserId: pick(sellers, n), kind: 'FOLLOW_UP', type: 'CALL',
        status: n % 2 === 0 ? 'COMPLETED' : 'SCHEDULED', scheduledAt: new Date(now - (n % 200) * day), completedAt: n % 2 === 0 ? new Date(now - (n % 200) * day) : null,
      })),
      (data) => prisma.appointment.createMany({ data: data as any })
    );
    await chunks(
      Array.from({ length: 2_500 }, (_, n) => ({
        id: randomUUID(), tenantId, clientId: pick(companyIds, n), createdByUserId: pick(sellers, n), status: 'SENT', version: 1,
        createdAt: new Date(now - (n % 300) * day), sentAt: new Date(now - (n % 300) * day),
      })),
      (data) => prisma.quotation.createMany({ data: data as any })
    );

    // 500 contracts and 6,000 instalments (NFR-PERF-04), a third of the instalments received and some reversed.
    const midnight = Math.floor(now / day) * day;
    const contracts = Array.from({ length: 500 }, (_, n) => ({
      id: randomUUID(), tenantId, clientId: pick(companyIds, n), assignedUserId: pick(sellers, n), planName: 'Gold', billingPeriod: 'MONTHLY', amount: '100.00',
      agreedAnnualValue: '1200.00', status: n % 5 === 0 ? 'EXPIRED' : 'ACTIVE', createdByUserId: manager,
      startsAt: new Date(midnight - 200 * day), endsAt: new Date(midnight + (n % 5 === 0 ? -(n % 90) - 1 : (n % 120) + 1) * day),
    }));
    await chunks(contracts, (data) => prisma.contract.createMany({ data: data as any }));
    const statuses = ['NOT_INVOICED', 'INVOICE_ISSUED', 'PAYMENT_PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'];
    const instalments = Array.from({ length: 6_000 }, (_, n) => {
      const status = pick(statuses, n);
      return {
        id: randomUUID(), tenantId, contractId: pick(contracts, n).id, periodIndex: (n % 12) + 1, dueDate: new Date(midnight + ((n % 200) - 150) * day), status,
        amount: '100.00', paidAmount: status === 'PAID' ? '100.00' : status === 'PARTIALLY_PAID' ? '40.00' : '0.00',
      };
    });
    await chunks(instalments, (data) => prisma.contractPayment.createMany({ data: data as any }));
    await chunks(
      instalments.filter((row) => row.paidAmount !== '0.00'),
      (data) =>
        prisma.contractPaymentHistory.createMany({
          data: data.map((row, n) => ({
            id: randomUUID(), tenantId, paymentId: row.id, fromStatus: 'PAYMENT_PENDING', toStatus: row.status, amountReceived: n % 10 === 0 ? `-${row.paidAmount}` : row.paidAmount,
            receivedOn: n % 10 === 0 ? null : new Date(midnight - (n % 250) * day), createdAt: new Date(now - (n % 250) * day),
          })) as any,
        })
    );
  }, 180_000);

  afterAll(async () => {
    await new PrismaTenantDeletionTransaction(prisma).run(tenantId);
    await prisma.$disconnect();
  });

  /** The fastest of three requests: a query that lost its index is slow every time, a busy test machine only some. */
  const timed = async (path: string, bearer?: string) => {
    let fastest = Infinity;
    let body: any;
    for (let attempt = 0; attempt < 3; attempt++) {
      const start = performance.now();
      const res = await get(path, bearer).expect(200);
      fastest = Math.min(fastest, performance.now() - start);
      body = res.body;
    }
    return { ms: fastest, body };
  };

  it.each([
    ['the year, with the comparison', '/performance?preset=THIS_YEAR&compare=true'],
    ['a custom range of 300 days', `/performance?preset=CUSTOM&from=${new Date(Date.now() - 300 * 86_400_000).toISOString().slice(0, 10)}&to=${new Date().toISOString().slice(0, 10)}`],
    ['the drill-down into deals won', '/performance/records?preset=THIS_YEAR&indicator=DEALS_WON&limit=50'],
    ['the drill-down into calls', '/performance/records?preset=THIS_YEAR&indicator=CALLS&limit=50'],
    ['the monthly series of one salesperson', '/performance/series?preset=THIS_YEAR&grain=MONTH&salespersonId=SELLER0'],
  ])('NFR-PERF-04: %s loads in under 2 seconds', async (_label, path) => {
    const { ms } = await timed(path.replace('SELLER0', sellers[0]));
    expect(ms).toBeLessThan(2_000);
  });

  it.each([
    ['the Sales Manager dashboard for the year', 'manager', '/dashboard/sales-manager?preset=THIS_YEAR'],
    ['the Sales Manager dashboard over 300 days', 'manager', `/dashboard/sales-manager?preset=CUSTOM&from=${new Date(Date.now() - 300 * 86_400_000).toISOString().slice(0, 10)}&to=${new Date().toISOString().slice(0, 10)}`],
    ['a Sales User dashboard for the year', 'seller', '/dashboard/sales-user?preset=THIS_YEAR'],
  ])('NFR-PERF-04: %s loads in under 2 seconds', async (_label, who, path) => {
    const { ms, body } = await timed(path, who === 'seller' ? sellerToken : token);
    expect(ms).toBeLessThan(2_000);
    expect(body.figures.length).toBeGreaterThan(5);
  });

  it.each([
    ['the CEO dashboard for the year', '/dashboard/ceo?preset=THIS_YEAR'],
    ['the CEO dashboard over 300 days', `/dashboard/ceo?preset=CUSTOM&from=${new Date(Date.now() - 300 * 86_400_000).toISOString().slice(0, 10)}&to=${new Date().toISOString().slice(0, 10)}`],
  ])('NFR-PERF-04: %s loads in under 2 seconds at 500 contracts and 6,000 instalments', async (_label, path) => {
    const { ms, body } = await timed(path, ceoToken);
    expect(ms).toBeLessThan(2_000);
    expect(body.figures.length).toBeGreaterThan(10);
    expect(body.tables.payments.reduce((sum: number, row: any) => sum + row.count, 0)).toBe(6_000);
  });

  it('NFR-PERF-04: the Administrator dashboard loads in under 2 seconds', async () => {
    const { ms, body } = await timed('/dashboard/administrator', adminToken);
    expect(ms).toBeLessThan(2_000);
    expect(body.tables.usersPerRole.length).toBeGreaterThan(0);
  });

  it('NFR-PERF-04: the Manager dashboard at this volume adds up to its rows', async () => {
    const { body } = await timed('/dashboard/sales-manager?preset=CUSTOM&from=2000-01-01&to=2100-01-01');
    const sum = (key: string) => body.tables.perSalesperson.reduce((total: number, row: any) => total + row[key], 0);
    const total = (key: string) => body.figures.find((figure: any) => figure.key === key).value;
    expect(body.tables.perSalesperson).toHaveLength(sellers.length);
    expect(total('dealsWon')).toBe(sum('dealsWon'));
    expect(total('dealsLost')).toBe(sum('dealsLost'));
    expect(total('activeDeals')).toBe(body.charts.pipeline.reduce((count: number, point: any) => count + point.count, 0));
    expect(body.tables.lostReasons.reduce((count: number, row: any) => count + row.count, 0)).toBe(total('dealsLost'));
  });

  it('NFR-PERF-04: the table at this volume has a row for each salesperson and a total equal to their sum', async () => {
    const { body } = await timed('/performance?preset=CUSTOM&from=2000-01-01&to=2100-01-01');
    expect(body.rows).toHaveLength(sellers.length);
    const sum = (key: string) => body.rows.reduce((total: number, row: any) => total + row.figures[key], 0);
    expect(body.total.figures.dealsWon).toBe(sum('dealsWon'));
    expect(body.total.figures.calls).toBe(sum('calls'));
    expect(body.total.figures.dealsWon + body.total.figures.dealsLost).toBeGreaterThan(1_000);
  });
});
