import request from 'supertest';
import express from 'express';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../../src/main/app';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { COMMERCIAL_FIELDS, PAYMENT_FIELDS } from '../../../src/access/domain/redactFields';
import { PrismaTenantDeletionTransaction } from '../../../src/tenant/infrastructure/PrismaTenantDeletionTransaction';
import { seedSystemRoles } from '../../support/seedRoles';

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();
const DAY = 86_400_000;

/** Every object key in a JSON response, at any depth, and every `key` a dashboard figure or table row carries. */
function namesIn(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => namesIn(item, found));
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      // `total` is also the row count of a page: money is always a string (rule 2), a count is a number.
      if (!(key === 'total' && typeof child === 'number')) found.add(key);
      if (key === 'key' && typeof child === 'string') found.add(child);
      namesIn(child, found);
    }
  }
  return found;
}

/**
 * NFR-SEC-06, FR-RBAC-21, FR-DSH-08 (Slice 15, the M3 security review): every Milestone 3 response is
 * read as the three roles whose redaction matters most, and no field they may not see is in it.
 * Reception holds neither permission; the second role holds `payments.view` but not `commercial.view`
 * (it may see that an instalment is overdue, not for how much); the third holds `commercial.view` but
 * not `payments.view`. The CEO dashboard and the Performance screen are included, with the
 * `{ key }` of each figure counted as a field name.
 */
describe('Milestone 3 responses never carry a field the viewer may not see (NFR-SEC-06)', () => {
  const tenantId = `t-redact-${randomUUID()}`;
  const slug = tenantId;
  let app: express.Express;
  let contractId = '';
  let paymentId = '';
  const who = { reception: `u-rr-${randomUUID()}`, paymentsOnly: `u-rp-${randomUUID()}`, commercialOnly: `u-rc-${randomUUID()}` };
  const tokens = {} as Record<keyof typeof who, string>;
  const get = (as: keyof typeof who, path: string) => request(app).get(`/api/${slug}${path}`).set('Authorization', `Bearer ${tokens[as]}`);

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({ data: { id: tenantId, name: 'Redaction tenant', urlSlug: slug, timezone: 'Europe/Tirane' } });
    const roles = await seedSystemRoles(prisma, tenantId);
    const custom = async (label: string, baseKey: RoleKey, keys: string[]) => {
      const id = `r-${label}-${randomUUID()}`;
      await prisma.role.create({
        data: { id, tenantId, key: `${label}-${randomUUID()}`, nameSq: label, nameEn: label, isSystem: false, baseKey, permissions: { create: keys.map((permissionKey) => ({ permissionKey, scope: 'ALL' })) } },
      });
      return id;
    };
    const base = ['companies.view', 'contracts.validity.view', 'contracts.manage', 'performance.view', 'deals.view'];
    const paymentsOnly = await custom('payments-only', RoleKey.Ceo, [...base, 'payments.view']);
    const commercialOnly = await custom('commercial-only', RoleKey.Ceo, [...base, 'commercial.view']);
    const user = (id: string, roleId: string) => ({ id, email: `${id}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId, tenantId, firstName: 'Test', lastName: id.slice(3, 6) });
    await prisma.user.createMany({
      data: [user(who.reception, roles[RoleKey.Reception]), user(who.paymentsOnly, paymentsOnly), user(who.commercialOnly, commercialOnly)],
    });
    for (const key of Object.keys(who) as Array<keyof typeof who>) tokens[key] = tokenService.sign({ userId: who[key], role: 'STAFF', tenantId, tenantSlug: slug } as any);

    const clientId = randomUUID();
    await prisma.client.create({ data: { id: clientId, tenantId, name: 'Redaction Co', status: 'CLIENT', customFieldValues: {}, lastUpdatedByUserId: who.reception } as any });
    const midnight = Math.floor(Date.now() / DAY) * DAY;
    contractId = randomUUID();
    await prisma.contract.create({
      data: {
        id: contractId, tenantId, clientId, planName: 'Gold', status: 'ACTIVE', amount: '49.40', billingPeriod: 'MONTHLY', agreedAnnualValue: '592.80', number: 'CTR-2026-0001',
        startsAt: new Date(midnight - 30 * DAY), endsAt: new Date(midnight + 25 * DAY), renewalDate: new Date(midnight + 25 * DAY), createdByUserId: who.reception,
        documentUrl: '/uploads/x/contract-x.pdf', documentName: 'signed.pdf',
      } as any,
    });
    paymentId = randomUUID();
    await prisma.contractPayment.create({
      data: { id: paymentId, tenantId, contractId, periodIndex: 1, dueDate: new Date(midnight - DAY), amount: '49.40', status: 'PARTIALLY_PAID', paidAmount: '20.00', invoiceNumber: 'INV-1', paidAt: new Date(midnight - DAY), method: 'CASH' } as any,
    });
    await prisma.contractPaymentHistory.create({
      data: { id: randomUUID(), tenantId, paymentId, fromStatus: 'PAYMENT_PENDING', toStatus: 'PARTIALLY_PAID', amountReceived: '20.00', receivedOn: new Date(midnight - DAY), method: 'CASH' } as any,
    });
    await prisma.deal.create({
      data: { id: randomUUID(), tenantId, clientId, ownerUserId: who.reception, createdByUserId: who.reception, type: 'NEW_CONTRACT', stageKey: 'WON', wonAt: new Date(), closedAt: new Date(), agreedAnnualValue: '592.80' } as any,
    });
  }, 60_000);

  afterAll(async () => {
    await new PrismaTenantDeletionTransaction(prisma).run(tenantId);
    await prisma.$disconnect();
  });

  const routes = () => [
    '/contracts',
    `/contracts/${contractId}`,
    `/contracts/${contractId}/payments`,
    `/contracts/${contractId}/payments/${paymentId}/history`,
    '/payments',
    '/payments?status=OVERDUE',
    '/renewals',
    '/performance?preset=THIS_YEAR',
    '/dashboard/ceo?preset=THIS_YEAR',
    '/dashboard/sales-manager?preset=THIS_YEAR',
  ];

  it.each([
    ['reception', [...COMMERCIAL_FIELDS, ...PAYMENT_FIELDS, 'documentUrl', 'documentName', 'dealId', 'renewalDate']],
    ['paymentsOnly', [...COMMERCIAL_FIELDS, 'documentUrl', 'documentName', 'dealId', 'renewalDate']],
    ['commercialOnly', PAYMENT_FIELDS],
  ] as const)('NFR-SEC-06, FR-RBAC-21 %s: no guarded field in any Milestone 3 response', async (role, forbidden) => {
    let readable = 0;
    for (const path of routes()) {
      const res = await get(role, path);
      // A route the role may not open is a refusal, which carries nothing.
      expect([200, 403, 404]).toContain(res.status);
      if (res.status !== 200) continue;
      readable += 1;
      const names = namesIn(res.body);
      const leaked = forbidden.filter((name) => names.has(name));
      expect({ path, leaked }).toEqual({ path, leaked: [] });
    }
    // Reception opens the contract and its validity; the other two open more. None is shut out of everything.
    expect(readable).toBeGreaterThan(0);
  });

  it('FR-RBAC-21 the payments-only role still sees the status of an instalment, and the commercial-only role still sees the price', async () => {
    const payments = await get('paymentsOnly', `/contracts/${contractId}/payments`).expect(200);
    expect(JSON.stringify(payments.body)).toContain('PARTIALLY_PAID');
    const detail = await get('commercialOnly', `/contracts/${contractId}`).expect(200);
    expect(JSON.stringify(detail.body)).toContain('49.40');
  });
});
