import request from 'supertest';
import { randomUUID } from 'crypto';
import { createApp } from '../../../main/app';
import { prisma } from '../../../shared/infrastructure/prisma/client';
import { JwtTokenService } from '../../../auth/infrastructure/JwtTokenService';
import { RoleKey } from '../../../access/domain/RoleKey';
import { seedSystemRoles } from '../../../../tests/support/seedRoles';

/** M3 Slice 6, UAT-4: Reception checks validity and sees nothing commercial (FR-CON-20..22, FR-RBAC-21). */
describe('Contract validity and the Reception view (UAT-4)', () => {
  const tenantId = `t-validity-${randomUUID()}`;
  const slug = tenantId;
  const ids = {
    reception: `u-rec-${randomUUID()}`,
    manager: `u-mgr-${randomUUID()}`,
    sales: `u-sales-${randomUUID()}`,
  };
  const tokenService = new JwtTokenService();
  let app: ReturnType<typeof createApp>;
  let roles: Record<RoleKey, string>;
  let clientId: string;
  let contractId: string;
  const token = (userId: string, role: 'STAFF' | 'BUSINESS_OWNER' = 'STAFF') =>
    tokenService.sign({ userId, role, tenantId, tenantSlug: slug } as any);
  const as = (userId: string) => ({
    get: (path: string) => request(app).get(`/api/${slug}${path}`).set('Authorization', `Bearer ${token(userId)}`),
    post: (path: string) => request(app).post(`/api/${slug}${path}`).set('Authorization', `Bearer ${token(userId)}`),
  });

  // The workspace day, so the dates below stay valid whenever the test runs.
  const dayOffset = (days: number) => new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + days));
  const iso = (date: Date) => date.toISOString().slice(0, 10);

  const newContract = (data: Record<string, unknown>) =>
    prisma.contract.create({
      data: {
        id: randomUUID(),
        tenantId,
        clientId,
        planName: 'Gold',
        amount: 100,
        billingPeriod: 'MONTHLY',
        createdByUserId: ids.manager,
        assignedUserId: ids.sales,
        ...data,
      } as any,
    });

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({ data: { id: tenantId, name: 'Validity tenant', urlSlug: slug } });
    roles = await seedSystemRoles(prisma, tenantId);
    await prisma.user.createMany({
      data: [
        { id: ids.reception, email: `${ids.reception}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId: roles[RoleKey.Reception], tenantId },
        { id: ids.manager, email: `${ids.manager}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId: roles[RoleKey.SalesManager], tenantId },
        { id: ids.sales, email: `${ids.sales}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId: roles[RoleKey.SalesUser], tenantId },
      ],
    });
    const client = await prisma.client.create({
      data: { id: randomUUID(), tenantId, name: 'Acme Wellness', status: 'ACTIVE', customFieldValues: {}, lastUpdatedByUserId: ids.manager, assignedUserId: ids.sales },
    });
    clientId = client.id;
    // An Expired past term and the Active current one: FR-CON-22.
    await newContract({ status: 'EXPIRED', startsAt: dayOffset(-800), endsAt: dayOffset(-436) });
    const current = await newContract({ status: 'ACTIVE', startsAt: dayOffset(-30), endsAt: dayOffset(300), number: 'CTR-2027-0001', notes: 'private note' });
    contractId = current.id;
  });

  afterAll(async () => {
    await prisma.auditEntry.deleteMany({ where: { tenantId } });
    await prisma.contractStatusHistory.deleteMany({ where: { tenantId } });
    await prisma.contractPayment.deleteMany({ where: { tenantId } });
    await prisma.contract.deleteMany({ where: { tenantId } });
    await prisma.notification.deleteMany({ where: { tenantId } });
    await prisma.client.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  });

  it('FR-CON-21: Reception searching the company sees the badge with dates and no commercial field', async () => {
    const res = await as(ids.reception).get('/clients/search?search=Acme').expect(200);
    const row = res.body.items.find((item: { id: string }) => item.id === clientId);
    expect(row.validity).toEqual({ status: 'VALID', reason: null, startsOn: iso(dayOffset(-30)), endsOn: iso(dayOffset(300)), daysLeft: 300 });
    expect(JSON.stringify(res.body)).not.toMatch(/amount|price|payment|deal|offer|document|planName/i);
  });

  it('FR-CON-21: the company page carries the badge too', async () => {
    const res = await as(ids.reception).get(`/clients/${clientId}`).expect(200);
    expect(res.body.validity).toMatchObject({ status: 'VALID', endsOn: iso(dayOffset(300)) });
  });

  it('FR-RBAC-21, NFR-SEC-06: Reception\'s contract has exactly the validity fields; documents and payments are refused', async () => {
    const detail = await as(ids.reception).get(`/contracts/${contractId}`).expect(200);
    expect(Object.keys(detail.body.contract).sort()).toEqual(['company', 'endsAt', 'id', 'number', 'startsAt', 'status', 'validity']);
    expect(detail.body).not.toHaveProperty('payments');
    expect(detail.body).not.toHaveProperty('documents');

    await as(ids.reception).get(`/contracts/${contractId}/documents`).expect(403);
    await as(ids.reception).get(`/contracts/${contractId}/payments`).expect((res) => {
      expect([403, 404]).toContain(res.status);
    });
  });

  it('FR-CON-21: the contract list carries a badge per row', async () => {
    const res = await as(ids.reception).get('/contracts').expect(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    for (const row of res.body.data) expect(row.validity).toBeDefined();
    expect(JSON.stringify(res.body)).not.toMatch(/amount|planName|notes/i);
  });

  it('FR-CON-21: a page of companies reads contracts in one query, not one per row', async () => {
    const extra = Array.from({ length: 12 }, (_, i) => ({
      id: randomUUID(), tenantId, name: `Bulk ${i}`, status: 'ACTIVE', customFieldValues: {}, lastUpdatedByUserId: ids.manager, assignedUserId: ids.sales,
    }));
    await prisma.client.createMany({ data: extra as any });
    const spy = jest.spyOn(prisma.contract, 'findMany');
    const res = await as(ids.reception).get('/clients/search?take=50').expect(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(13);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('UAT-4: the Sales Manager suspends, Reception sees "Not valid: Suspended", reinstating makes it valid again', async () => {
    await as(ids.manager).post(`/contracts/${contractId}/status`).send({ status: 'SUSPENDED', reason: 'Payment dispute' }).expect(200);
    let res = await as(ids.reception).get(`/clients/${clientId}`).expect(200);
    expect(res.body.validity).toMatchObject({ status: 'NOT_VALID', reason: 'SUSPENDED' });

    await as(ids.manager).post(`/contracts/${contractId}/status`).send({ status: 'ACTIVE', reason: 'Dispute settled' }).expect(200);
    res = await as(ids.reception).get(`/clients/${clientId}`).expect(200);
    expect(res.body.validity).toMatchObject({ status: 'VALID' });
  });
});
