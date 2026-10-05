import request from 'supertest';
import { createApp } from '../../../main/app';
import { prisma } from '../../../shared/infrastructure/prisma/client';
import { ContractStatus } from '../../domain/Contract';
import { PaymentStatus } from '../../domain/ContractPayment';
import { ContractExpiryJob } from '../../../scheduler/jobs/ContractExpiryJob';
import { ContractRenewalReminderJob } from '../../../scheduler/jobs/ContractRenewalReminderJob';
import { PrismaSchedulerQueries } from '../../../scheduler/PrismaSchedulerQueries';
import { ExpireContractUseCase } from '../../application/use-cases/ExpireContractUseCase';
import { PrismaContractWriteTransaction } from '../../infrastructure/PrismaContractWriteTransaction';

let app: any;
let tokenOwner: string;
let tokenOtherStaff: string;
let tenantId: string;
let clientId: string;
let ownerId: string;
let otherStaffId: string;
const tenantSlug = 'contract-integ-test';

const api = () => request(app);
const base = () => `/api/${tenantSlug}/contracts`;

beforeAll(async () => {
  app = createApp();

  const tenant = await prisma.tenant.create({
    data: {
      id: 'tenant-contract-integ',
      name: 'Contract Integration Test Tenant',
      urlSlug: tenantSlug,
    },
  });
  tenantId = tenant.id;

  const owner = await prisma.user.create({
    data: {
      id: 'user-contract-owner',
      tenantId,
      email: 'owner@contractinteg.com',
      hashedPassword: 'hash',
      role: 'BUSINESS_OWNER',
    },
  });
  ownerId = owner.id;

  const otherStaff = await prisma.user.create({
    data: {
      id: 'user-contract-staff',
      tenantId,
      email: 'staff@contractinteg.com',
      hashedPassword: 'hash',
      role: 'STAFF',
    },
  });
  otherStaffId = otherStaff.id;

  const { JwtTokenService } = require('../../../auth/infrastructure/JwtTokenService');
  const tokenService = new JwtTokenService();
  tokenOwner = tokenService.sign({
    userId: owner.id,
    role: owner.role,
    tenantId,
    tenantSlug,
  });
  tokenOtherStaff = tokenService.sign({
    userId: otherStaff.id,
    role: otherStaff.role,
    tenantId,
    tenantSlug,
  });

  const client = await prisma.client.create({
    data: {
      id: 'client-contract-integ',
      tenantId,
      name: 'Acme Ltd',
      status: 'ACTIVE',
      customFieldValues: {},
      lastUpdatedByUserId: owner.id,
    },
  });
  clientId = client.id;
});

afterAll(async () => {
  if (tenantId) {
    await prisma.contractStatusHistory.deleteMany({ where: { tenantId } });
    await prisma.contractPayment.deleteMany({ where: { tenantId } });
    await prisma.contract.deleteMany({ where: { tenantId } });
    await prisma.notification.deleteMany({ where: { tenantId } });
    await prisma.client.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  }
  await prisma.$disconnect();
});

/** A fresh DRAFT contract, returned as the API returns it. */
const createContract = async (overrides: Record<string, unknown> = {}) => {
  const res = await api()
    .post(base())
    .set('Authorization', `Bearer ${tokenOwner}`)
    .send({
      clientId,
      planName: 'Gold',
      amount: 100,
      billingPeriod: 'MONTHLY',
      startsAt: '2026-01-01',
      endsAt: '2026-12-31',
      ...overrides,
    });
  expect(res.status).toBe(201);
  return res.body;
};

describe('Contracts API', () => {
  it('creates a contract as DRAFT, with no payment schedule yet', async () => {
    const contract = await createContract();

    expect(contract.status).toBe(ContractStatus.Draft);
    expect(contract.clientName).toBe('Acme Ltd');
    // Defaults to the person who sold it, so the expiry warning has a
    // recipient without anyone having to pick one.
    expect(contract.assignedUserId).toBe(ownerId);

    const detail = await api()
      .get(`${base()}/${contract.id}`)
      .set('Authorization', `Bearer ${tokenOwner}`);
    expect(detail.body.payments).toHaveLength(0);
  });

  it('rejects a contract for a client that does not exist', async () => {
    const res = await api()
      .post(base())
      .set('Authorization', `Bearer ${tokenOwner}`)
      .send({
        clientId: 'no-such-client',
        planName: 'Gold',
        amount: 100,
        billingPeriod: 'MONTHLY',
        startsAt: '2026-01-01',
        endsAt: '2026-12-31',
      });

    expect(res.status).toBe(404);
  });

  it('generates the payment schedule on activation', async () => {
    const contract = await createContract();

    const activated = await api()
      .post(`${base()}/${contract.id}/activate`)
      .set('Authorization', `Bearer ${tokenOwner}`);

    expect(activated.status).toBe(200);
    expect(activated.body.contract.status).toBe(ContractStatus.Active);
    expect(activated.body.generatedPayments).toBe(12);

    const detail = await api()
      .get(`${base()}/${contract.id}`)
      .set('Authorization', `Bearer ${tokenOwner}`);

    expect(detail.body.payments).toHaveLength(12);
    // FR-PAY-02: activation lays the instalments out as Not Invoiced, nothing received.
    expect(detail.body.payments.every((p: any) => p.status === PaymentStatus.NotInvoiced && p.paidAmount === '0.00')).toBe(true);
    expect(detail.body.contract.paymentSummary.outstanding).toBe(1200);
  });

  it('does not regenerate the schedule if one already exists', async () => {
    const contract = await createContract();
    await api().post(`${base()}/${contract.id}/activate`).set('Authorization', `Bearer ${tokenOwner}`);

    // Reaching activate a second time is refused by the transition guard, so
    // the schedule cannot be doubled through the API at all.
    const again = await api()
      .post(`${base()}/${contract.id}/activate`)
      .set('Authorization', `Bearer ${tokenOwner}`);

    expect(again.status).toBe(400);

    const detail = await api()
      .get(`${base()}/${contract.id}`)
      .set('Authorization', `Bearer ${tokenOwner}`);
    expect(detail.body.payments).toHaveLength(12);
  });

  describe('recording payments', () => {
    const activated = async () => {
      const contract = await createContract();
      await api().post(`${base()}/${contract.id}/activate`).set('Authorization', `Bearer ${tokenOwner}`);
      const detail = await api().get(`${base()}/${contract.id}`).set('Authorization', `Bearer ${tokenOwner}`);
      return { contract, payments: detail.body.payments as Array<{ id: string }> };
    };
    const receipt = (contractId: string, paymentId: string, body: Record<string, unknown>) =>
      api()
        .post(`${base()}/${contractId}/payments/${paymentId}/receipts`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ receivedOn: '2026-01-02', method: 'BANK_TRANSFER', ...body });

    it('a full receipt marks an instalment Paid and updates the contract rollup', async () => {
      const { contract, payments } = await activated();

      const res = await receipt(contract.id, payments[0].id, { amount: '100.00' });

      expect(res.status).toBe(201);
      expect(res.body.payment.status).toBe(PaymentStatus.Paid);
      expect(res.body.payment.method).toBe('BANK_TRANSFER');
      expect(res.body.contract.paymentSummary.paid).toBe(100);
      expect(res.body.contract.paymentSummary.outstanding).toBe(1100);
    });

    it('a part receipt is Partially Paid and leaves the rest outstanding', async () => {
      const { contract, payments } = await activated();

      const res = await receipt(contract.id, payments[0].id, { amount: '40.00' });

      expect(res.body.payment.status).toBe(PaymentStatus.PartiallyPaid);
      expect(res.body.payment.outstanding).toBe('60.00');
    });

    it('reversing a receipt takes the money back off', async () => {
      const { contract, payments } = await activated();
      await receipt(contract.id, payments[0].id, { amount: '100.00' });

      const res = await api()
        .post(`${base()}/${contract.id}/payments/${payments[0].id}/receipts/reverse`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ amount: '100.00', comment: 'Transfer bounced' });

      expect(res.status).toBe(200);
      expect(res.body.payment.status).toBe(PaymentStatus.NotInvoiced);
      expect(res.body.payment.paidAmount).toBe('0.00');
      expect(res.body.contract.paymentSummary.paid).toBe(0);
    });

    it('refuses a payment id belonging to a different contract', async () => {
      const a = await activated();
      const b = await activated();

      const res = await receipt(a.contract.id, b.payments[0].id, { amount: '10.00' });

      expect(res.status).toBe(404);
    });

    it('refuses to delete an instalment that has money against it', async () => {
      const { contract, payments } = await activated();
      await receipt(contract.id, payments[0].id, { amount: '100.00' });

      const res = await api()
        .delete(`${base()}/${contract.id}/payments/${payments[0].id}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ reason: 'Entered twice' });

      expect(res.status).toBe(400);
    });

    it('adds an ad-hoc payment outside the generated schedule', async () => {
      const { contract } = await activated();

      const res = await api()
        .post(`${base()}/${contract.id}/payments`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ dueDate: '2026-02-15', amount: '250.00', note: 'Setup fee', reason: 'Set-up fee agreed' });

      expect(res.status).toBe(201);
      expect(res.body.payment.periodIndex).toBe(13);
      expect(res.body.payment.status).toBe(PaymentStatus.NotInvoiced);
      expect(res.body.contract.paymentSummary.outstanding).toBe(1450);
    });
  });

  describe('lifecycle', () => {
    it('cancels a contract and leaves its already-due instalments in place', async () => {
      // A term that began last year: every instalment is already due, so none is "future" (FR-CON-15).
      const contract = await createContract({ startsAt: '2025-01-01', endsAt: '2025-12-31' });
      await api().post(`${base()}/${contract.id}/activate`).set('Authorization', `Bearer ${tokenOwner}`);

      const res = await api()
        .post(`${base()}/${contract.id}/cancel`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ reason: 'Customer closed down' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(ContractStatus.Cancelled);

      const detail = await api()
        .get(`${base()}/${contract.id}`)
        .set('Authorization', `Bearer ${tokenOwner}`);
      expect(detail.body.payments).toHaveLength(12);
      expect(detail.body.history.some((h: any) => h.note === 'Customer closed down')).toBe(true);
    });

    it('refuses to renew a live contract, and renews a cancelled one into a new term', async () => {
      const contract = await createContract();
      await api().post(`${base()}/${contract.id}/activate`).set('Authorization', `Bearer ${tokenOwner}`);

      const tooEarly = await api()
        .post(`${base()}/${contract.id}/renew`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({});
      expect(tooEarly.status).toBe(400);

      await api().post(`${base()}/${contract.id}/cancel`).set('Authorization', `Bearer ${tokenOwner}`).send({ reason: 'Ended early' });

      const renewed = await api()
        .post(`${base()}/${contract.id}/renew`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ amount: 120 });

      expect(renewed.status).toBe(201);
      expect(renewed.body.id).not.toBe(contract.id);
      expect(renewed.body.status).toBe(ContractStatus.Draft);
      expect(renewed.body.amount).toBe('120.00');
      // Inherits the plan it renewed, and starts the day the old term ended.
      expect(renewed.body.planName).toBe('Gold');
      expect(renewed.body.renewedFromContractId).toBe(contract.id);
      expect(String(renewed.body.startsAt).slice(0, 10)).toBe('2027-01-01');

      // The old term's own history records that it was renewed, so opening the
      // predecessor shows the link rather than a dead end.
      const previous = await api()
        .get(`${base()}/${contract.id}`)
        .set('Authorization', `Bearer ${tokenOwner}`);
      expect(previous.body.history.some((h: any) => h.note?.includes('Renewed into'))).toBe(true);
    });

    it('refuses to edit a terminal contract', async () => {
      const contract = await createContract();
      await api().post(`${base()}/${contract.id}/cancel`).set('Authorization', `Bearer ${tokenOwner}`).send({ reason: 'Ended early' });

      const res = await api()
        .patch(`${base()}/${contract.id}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ amount: 999 });

      expect(res.status).toBe(400);
    });

    it('flags that the schedule needs review when a live price changes', async () => {
      const contract = await createContract();
      await api().post(`${base()}/${contract.id}/activate`).set('Authorization', `Bearer ${tokenOwner}`);

      const res = await api()
        .patch(`${base()}/${contract.id}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ amount: 150 });

      expect(res.status).toBe(200);
      expect(res.body.scheduleNeedsReview).toBe(true);
      // The already-generated instalments are NOT silently restated.
      const detail = await api()
        .get(`${base()}/${contract.id}`)
        .set('Authorization', `Bearer ${tokenOwner}`);
      expect(detail.body.payments[0].amount).toBe('100.00');
    });
  });

  describe('access control (FR-RBAC-11: a contract follows its company)', () => {
    /** A company assigned to the Sales User, and one contract on it. */
    const staffCompanyContract = async () => {
      const staffClientId = `client-contract-staff-${Date.now()}-${Math.random()}`;
      await prisma.client.create({
        data: {
          id: staffClientId, tenantId, name: 'Staff Co', status: 'ACTIVE',
          assignedUserId: otherStaffId, customFieldValues: {}, lastUpdatedByUserId: ownerId,
        },
      });
      return createContract({ clientId: staffClientId });
    };

    it('a contract on another salesperson\'s (or nobody\'s) company is not found for a Sales User', async () => {
      // Even when the contract names them as its assignee: the company decides.
      const contract = await createContract({ assignedUserId: otherStaffId });

      const res = await api()
        .get(`${base()}/${contract.id}`)
        .set('Authorization', `Bearer ${tokenOtherStaff}`);

      expect(res.status).toBe(404);
    });

    it('lets a Sales User see a contract on a company assigned to them', async () => {
      const contract = await staffCompanyContract();

      const res = await api()
        .get(`${base()}/${contract.id}`)
        .set('Authorization', `Bearer ${tokenOtherStaff}`);

      expect(res.status).toBe(200);
    });

    it('scopes the list for a Sales User to their own companies\' contracts', async () => {
      await createContract();
      const mine = await staffCompanyContract();

      const res = await api().get(base()).set('Authorization', `Bearer ${tokenOtherStaff}`);

      expect(res.status).toBe(200);
      expect(res.body.data.map((c: any) => c.id)).toContain(mine.id);
      expect(res.body.data.every((c: any) => c.clientId !== clientId)).toBe(true);
    });
  });

  describe('client view', () => {
    it('summarises whether the client is currently subscribed', async () => {
      const contract = await createContract();
      await api().post(`${base()}/${contract.id}/activate`).set('Authorization', `Bearer ${tokenOwner}`);

      const res = await api()
        .get(`${base()}/client/${clientId}`)
        .set('Authorization', `Bearer ${tokenOwner}`);

      expect(res.status).toBe(200);
      expect(res.body.summary.hasActiveContract).toBe(true);
      expect(res.body.summary.activePlanName).toBe('Gold');
      expect(res.body.summary.outstanding).toBeGreaterThan(0);
    });
  });

  describe('scheduler sweeps', () => {
    const queries = new PrismaSchedulerQueries(prisma);

    it('expires a contract whose term has ended and notifies the owner', async () => {
      const contract = await createContract({
        startsAt: '2020-01-01',
        endsAt: '2020-12-31',
      });
      await api().post(`${base()}/${contract.id}/activate`).set('Authorization', `Bearer ${tokenOwner}`);

      const notifications = { emitStrict: jest.fn().mockResolvedValue(undefined) } as any;
      const job = new ContractExpiryJob(
        queries,
        new ExpireContractUseCase(new PrismaContractWriteTransaction(prisma)),
        notifications
      );

      await job.run(new Date('2026-01-01'));

      const row = await prisma.contract.findUnique({ where: { id: contract.id } });
      expect(row?.status).toBe(ContractStatus.Expired);
      expect(notifications.emitStrict).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'CONTRACT_EXPIRED', entityId: contract.id })
      );

      // The history explains that the scheduler did it, not a person.
      const history = await prisma.contractStatusHistory.findMany({
        where: { contractId: contract.id, toStatus: ContractStatus.Expired },
      });
      expect(history).toHaveLength(1);
      expect(history[0].changedByUserId).toBeNull();
    });

    it('warns once about a contract nearing its end, then not again', async () => {
      const contract = await createContract({
        startsAt: '2026-01-01',
        endsAt: '2026-06-20',
      });
      await api().post(`${base()}/${contract.id}/activate`).set('Authorization', `Bearer ${tokenOwner}`);

      const notifications = { emitSafe: jest.fn().mockResolvedValue([]) } as any;
      const job = new ContractRenewalReminderJob(queries, notifications);

      await job.run(new Date('2026-06-01'));
      expect(notifications.emitSafe).toHaveBeenCalledTimes(1);
      expect(notifications.emitSafe).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'CONTRACT_EXPIRING',
          params: expect.objectContaining({ clientName: 'Acme Ltd', planName: 'Gold' }),
        })
      );

      // The marker column is the dedup: a second sweep an hour later is silent.
      await job.run(new Date('2026-06-01T01:00:00Z'));
      expect(notifications.emitSafe).toHaveBeenCalledTimes(1);
    });
  });
});
