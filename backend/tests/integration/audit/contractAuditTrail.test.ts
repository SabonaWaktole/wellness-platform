import request from 'supertest';
import { createApp } from '../../../src/main/app';
import { prisma } from '../../../src/shared/infrastructure/prisma/client';
import { ContractStatus } from '../../../src/contracts/domain/Contract';
import { ContractExpiryJob } from '../../../src/scheduler/jobs/ContractExpiryJob';
import { PrismaSchedulerQueries } from '../../../src/scheduler/PrismaSchedulerQueries';
import { ExpireContractUseCase } from '../../../src/contracts/application/use-cases/ExpireContractUseCase';
import { ActivateContractUseCase } from '../../../src/contracts/application/use-cases/ActivateContractUseCase';
import { PrismaContractWriteTransaction } from '../../../src/contracts/infrastructure/PrismaContractWriteTransaction';
import { administrator, scopeResolver } from '../../support/access';

let app: any;
let tokenOwner: string;
let tenantId: string;
let clientId: string;
let ownerId: string;
const tenantSlug = 'contract-audit-integ-test';

const api = () => request(app);
const base = () => `/api/${tenantSlug}/contracts`;

beforeAll(async () => {
  app = createApp();

  const tenant = await prisma.tenant.create({
    data: {
      id: 'tenant-contract-audit-integ',
      name: 'Contract Audit Integration Test Tenant',
      urlSlug: tenantSlug,
    },
  });
  tenantId = tenant.id;

  const owner = await prisma.user.create({
    data: {
      id: 'user-contract-audit-owner',
      tenantId,
      email: 'owner@contractauditinteg.com',
      hashedPassword: 'hash',
      role: 'BUSINESS_OWNER',
    },
  });
  ownerId = owner.id;

  const { JwtTokenService } = require('../../../src/auth/infrastructure/JwtTokenService');
  const tokenService = new JwtTokenService();
  tokenOwner = tokenService.sign({
    userId: owner.id,
    role: owner.role,
    tenantId,
    tenantSlug,
  });

  const client = await prisma.client.create({
    data: {
      id: 'client-contract-audit-integ',
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
    await prisma.auditEntry.deleteMany({ where: { tenantId } });
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
  return res.body;
};

describe('Contract audit trail (Slice 2)', () => {
  it('FR-AUD-02 activating a contract writes one AuditEntry with status DRAFT to ACTIVE', async () => {
    const contract = await createContract();

    const res = await api()
      .post(`${base()}/${contract.id}/activate`)
      .set('Authorization', `Bearer ${tokenOwner}`);
    expect(res.status).toBe(200);

    const entries = await prisma.auditEntry.findMany({
      where: { tenantId, entityType: 'Contract', entityId: contract.id, action: 'STATUS_CHANGE' },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].userId).toBe(ownerId);
    const changes = entries[0].changes as Array<{ field: string; old: unknown; new: unknown }>;
    expect(changes).toEqual(
      expect.arrayContaining([{ field: 'status', old: 'DRAFT', new: 'ACTIVE' }])
    );
  });

  it('FR-AUD-02 recording a payment writes one AuditEntry with the old and new status and paidAmount', async () => {
    const contract = await createContract({ startsAt: '2026-01-01', endsAt: '2026-03-31' });
    await api().post(`${base()}/${contract.id}/activate`).set('Authorization', `Bearer ${tokenOwner}`);

    const detailRes = await api().get(`${base()}/${contract.id}`).set('Authorization', `Bearer ${tokenOwner}`);
    const payment = detailRes.body.payments[0];

    const res = await api()
      .post(`${base()}/${contract.id}/payments/${payment.id}/record`)
      .set('Authorization', `Bearer ${tokenOwner}`)
      .send({ action: 'PAY', amount: payment.amount });
    expect(res.status).toBe(200);

    const entries = await prisma.auditEntry.findMany({
      where: { tenantId, entityType: 'ContractPayment', entityId: payment.id },
    });
    expect(entries).toHaveLength(1);
    const changes = entries[0].changes as Array<{ field: string; old: unknown; new: unknown }>;
    expect(changes).toEqual(
      expect.arrayContaining([
        { field: 'status', old: 'UNPAID', new: 'PAID' },
        { field: 'paidAmount', old: 0, new: payment.amount },
      ])
    );
  });

  it('FR-AUD-04 rolls back the whole activation when the audit write fails', async () => {
    const contract = await createContract();

    const failingWriteTx = new PrismaContractWriteTransaction(prisma, () => ({
      record: async () => {
        throw new Error('audit write failed');
      },
    }));
    const useCase = new ActivateContractUseCase(failingWriteTx, scopeResolver());

    await expect(
      useCase.execute({
        tenantId,
        contractId: contract.id,
        actingUserId: ownerId,
        access: administrator({ userId: ownerId, tenantId }),
      })
    ).rejects.toThrow('audit write failed');

    const row = await prisma.contract.findUnique({ where: { id: contract.id } });
    expect(row?.status).toBe(ContractStatus.Draft);

    const payments = await prisma.contractPayment.findMany({ where: { contractId: contract.id } });
    expect(payments).toHaveLength(0);

    // Creating the contract already wrote one history row ("Contract
    // created"); the failed activation attempt must not have added another.
    const history = await prisma.contractStatusHistory.findMany({ where: { contractId: contract.id } });
    expect(history).toHaveLength(1);
    expect(history[0].note).toBe('Contract created');
  });

  it('FR-AUD-02 the scheduler-driven expiry leaves an AuditEntry with a SYSTEM actor', async () => {
    const contract = await createContract({ startsAt: '2020-01-01', endsAt: '2020-12-31' });
    await api().post(`${base()}/${contract.id}/activate`).set('Authorization', `Bearer ${tokenOwner}`);

    const queries = new PrismaSchedulerQueries(prisma);
    const notifications = { emitSafe: jest.fn().mockResolvedValue([]) } as any;
    const job = new ContractExpiryJob(
      queries,
      new ExpireContractUseCase(new PrismaContractWriteTransaction(prisma)),
      notifications
    );

    await job.run(new Date('2026-01-01'));

    const entries = await prisma.auditEntry.findMany({
      where: { tenantId, entityType: 'Contract', entityId: contract.id, action: 'STATUS_CHANGE' },
      orderBy: { at: 'desc' },
    });
    expect(entries[0].userId).toBeNull();
    expect(entries[0].userRole).toBe('SYSTEM');
  });

  it('FR-AUD-05 the trail can be read (Slice 7) but never updated or deleted', async () => {
    const get = await api().get(`/api/${tenantSlug}/audit`).set('Authorization', `Bearer ${tokenOwner}`);
    const put = await api().put(`/api/${tenantSlug}/audit/some-id`).set('Authorization', `Bearer ${tokenOwner}`);
    const del = await api()
      .delete(`/api/${tenantSlug}/audit/some-id`)
      .set('Authorization', `Bearer ${tokenOwner}`);

    // The Administrator (BUSINESS_OWNER's D2 mapping) holds audit.view, so
    // the viewer's own read route answers. There is still no PUT or DELETE
    // route anywhere on /audit — a written entry can never be changed.
    expect(get.status).toBe(200);
    expect(put.status).toBe(404);
    expect(del.status).toBe(404);
  });
});
