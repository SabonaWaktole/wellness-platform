import { randomUUID } from 'crypto';
import { Contract, ContractStatus, BillingPeriod } from '../../../src/contracts/domain/Contract';
import { ContractPayment, PaymentStatus } from '../../../src/contracts/domain/ContractPayment';
import { ActivateContractUseCase } from '../../../src/contracts/application/use-cases/ActivateContractUseCase';
import { CancelContractUseCase } from '../../../src/contracts/application/use-cases/CancelContractUseCase';
import { RenewContractUseCase } from '../../../src/contracts/application/use-cases/RenewContractUseCase';
import { UpdateContractUseCase } from '../../../src/contracts/application/use-cases/UpdateContractUseCase';
import { ExpireContractUseCase } from '../../../src/contracts/application/use-cases/ExpireContractUseCase';
import { CreateContractUseCase } from '../../../src/contracts/application/use-cases/CreateContractUseCase';
import { RecordContractPaymentUseCase } from '../../../src/contracts/application/use-cases/RecordContractPaymentUseCase';
import { AddContractPaymentUseCase } from '../../../src/contracts/application/use-cases/AddContractPaymentUseCase';
import { UpdateContractPaymentUseCase } from '../../../src/contracts/application/use-cases/UpdateContractPaymentUseCase';
import { DeleteContractPaymentUseCase } from '../../../src/contracts/application/use-cases/DeleteContractPaymentUseCase';
import { makeContractWriteHarness } from '../../support/fakeContractWriteTransaction';
import { AuditAction } from '../../../src/audit/domain/AuditAction';
import { administrator, scopeResolver } from '../../support/access';

const TENANT_ID = 'tenant-1';
const USER_ID = 'user-1';
const USER_ROLE = 'ADMINISTRATOR';

function draftContract(overrides: Partial<Parameters<typeof Contract.create>[0]> = {}): Contract {
  return Contract.create({
    id: randomUUID(),
    tenantId: TENANT_ID,
    clientId: 'client-1',
    planName: 'Gold',
    amount: 100,
    billingPeriod: BillingPeriod.Monthly,
    startsAt: new Date('2026-01-01T00:00:00.000Z'),
    endsAt: new Date('2026-12-31T00:00:00.000Z'),
    createdByUserId: USER_ID,
    assignedUserId: USER_ID,
    clientName: 'Acme',
    ...overrides,
  });
}

/** A tenant repository whose one workspace runs the given sales workflow (M3 D1). */
function tenantsWorkflow(workflow: 'SALES_PROCESS' | 'LEGACY_QUOTATIONS') {
  return { findById: jest.fn().mockResolvedValue({ runsSalesProcess: () => workflow === 'SALES_PROCESS' }) } as any;
}

function draftPayment(overrides: Partial<Parameters<typeof ContractPayment.create>[0]> = {}) {
  return ContractPayment.create({
    id: randomUUID(),
    tenantId: TENANT_ID,
    contractId: 'contract-1',
    periodIndex: 1,
    dueDate: new Date('2026-02-01T00:00:00.000Z'),
    amount: 100,
    ...overrides,
  });
}

describe('CreateContractUseCase audit trail', () => {
  it('FR-AUD-02 records a CREATE entry with no old value', async () => {
    const harness = makeContractWriteHarness();
    harness.contractRepo.findById.mockResolvedValue(draftContract());
    const clientRepo = { findById: jest.fn().mockResolvedValue({ id: 'client-1' }) } as any;
    const useCase = new CreateContractUseCase(harness.writeTx, clientRepo, scopeResolver(), tenantsWorkflow('LEGACY_QUOTATIONS'));

    await useCase.execute({
      tenantId: TENANT_ID,
      clientId: 'client-1',
      planName: 'Gold',
      amount: 100,
      billingPeriod: BillingPeriod.Monthly,
      startsAt: new Date('2026-01-01T00:00:00.000Z'),
      endsAt: new Date('2026-12-31T00:00:00.000Z'),
      actingUserId: USER_ID,
      access: administrator({ userId: USER_ID, tenantId: TENANT_ID }),
    });

    const [entry] = harness.recordedAuditEntries();
    expect(entry.action).toBe(AuditAction.Create);
    expect(entry.entityType).toBe('Contract');
    expect(entry.userId).toBe(USER_ID);
    expect(entry.userRole).toBe(USER_ROLE);
    expect(entry.changes.every((change) => change.old === null)).toBe(true);
  });
});

describe('ActivateContractUseCase audit trail', () => {
  it('FR-AUD-02 records exactly one STATUS_CHANGE entry for status DRAFT to ACTIVE', async () => {
    const harness = makeContractWriteHarness();
    const contract = draftContract();
    harness.contractRepo.findById.mockResolvedValue(contract);
    const useCase = new ActivateContractUseCase(harness.writeTx, scopeResolver());

    await useCase.execute({
      tenantId: TENANT_ID,
      contractId: contract.id,
      actingUserId: USER_ID,
      access: administrator({ userId: USER_ID, tenantId: TENANT_ID }),
    });

    const entries = harness.recordedAuditEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe(AuditAction.StatusChange);
    const statusChange = entries[0].changes.find((change) => change.field === 'status');
    expect(statusChange).toEqual({ field: 'status', old: 'DRAFT', new: 'ACTIVE' });
  });
});

describe('CancelContractUseCase audit trail', () => {
  it('FR-AUD-02 records a STATUS_CHANGE entry and carries the reason', async () => {
    const harness = makeContractWriteHarness();
    const contract = draftContract({ status: ContractStatus.Active });
    harness.contractRepo.findById.mockResolvedValue(contract);
    const useCase = new CancelContractUseCase(harness.writeTx, scopeResolver());

    await useCase.execute({
      tenantId: TENANT_ID,
      contractId: contract.id,
      reason: 'Client requested',
      actingUserId: USER_ID,
      access: administrator({ userId: USER_ID, tenantId: TENANT_ID }),
    });

    const [entry] = harness.recordedAuditEntries();
    expect(entry.action).toBe(AuditAction.StatusChange);
    expect(entry.changes.some((change) => change.field === 'cancelReason' && change.new === 'Client requested')).toBe(
      true
    );
  });
});

describe('RenewContractUseCase audit trail', () => {
  it('FR-AUD-02 records a CREATE entry for the new term, carrying renewedFromContractId', async () => {
    const harness = makeContractWriteHarness();
    const previous = draftContract({ status: ContractStatus.Expired });
    harness.contractRepo.findById.mockResolvedValueOnce(previous).mockResolvedValueOnce(
      draftContract({ renewedFromContractId: previous.id })
    );
    const useCase = new RenewContractUseCase(harness.writeTx, scopeResolver());

    await useCase.execute({
      tenantId: TENANT_ID,
      contractId: previous.id,
      actingUserId: USER_ID,
      access: administrator({ userId: USER_ID, tenantId: TENANT_ID }),
    });

    const [entry] = harness.recordedAuditEntries();
    expect(entry.action).toBe(AuditAction.Create);
    const renewedFrom = entry.changes.find((change) => change.field === 'renewedFromContractId');
    expect(renewedFrom?.new).toBe(previous.id);
  });
});

describe('UpdateContractUseCase audit trail', () => {
  it('FR-AUD-02 records an UPDATE entry with the changed terms', async () => {
    const harness = makeContractWriteHarness();
    const contract = draftContract({ status: ContractStatus.Active });
    harness.contractRepo.findById.mockResolvedValue(contract);
    const useCase = new UpdateContractUseCase(harness.writeTx, scopeResolver());

    await useCase.execute({
      tenantId: TENANT_ID,
      contractId: contract.id,
      amount: 150,
      actingUserId: USER_ID,
      access: administrator({ userId: USER_ID, tenantId: TENANT_ID }),
    });

    const [entry] = harness.recordedAuditEntries();
    expect(entry.action).toBe(AuditAction.Update);
    expect(entry.changes).toEqual([{ field: 'amount', old: 100, new: 150 }]);
  });

  it('FR-AUD-03 records nothing when the edit changes nothing', async () => {
    const harness = makeContractWriteHarness();
    const contract = draftContract({ status: ContractStatus.Active });
    harness.contractRepo.findById.mockResolvedValue(contract);
    const useCase = new UpdateContractUseCase(harness.writeTx, scopeResolver());

    await useCase.execute({
      tenantId: TENANT_ID,
      contractId: contract.id,
      planName: contract.planName,
      actingUserId: USER_ID,
      access: administrator({ userId: USER_ID, tenantId: TENANT_ID }),
    });

    expect(harness.recordedAuditEntries()).toHaveLength(0);
  });
});

describe('ExpireContractUseCase audit trail', () => {
  it('FR-AUD-02 records a STATUS_CHANGE entry with the SYSTEM actor, no acting user', async () => {
    const harness = makeContractWriteHarness();
    const contract = draftContract({ status: ContractStatus.Active });
    harness.contractRepo.findById.mockResolvedValue(contract);
    const useCase = new ExpireContractUseCase(harness.writeTx);

    await useCase.execute({ tenantId: TENANT_ID, contractId: contract.id });

    const [entry] = harness.recordedAuditEntries();
    expect(entry.action).toBe(AuditAction.StatusChange);
    expect(entry.userId).toBeNull();
    expect(entry.userRole).toBe('SYSTEM');
  });
});

describe('RecordContractPaymentUseCase audit trail', () => {
  it('FR-AUD-02 records a STATUS_CHANGE entry when a payment is marked PAID', async () => {
    const harness = makeContractWriteHarness();
    const contract = draftContract({ status: ContractStatus.Active });
    const payment = draftPayment({ contractId: contract.id });
    harness.contractRepo.findById.mockResolvedValue(contract);
    harness.paymentRepo.findById.mockResolvedValue(payment);
    const useCase = new RecordContractPaymentUseCase(harness.writeTx, scopeResolver());

    await useCase.execute({
      tenantId: TENANT_ID,
      contractId: contract.id,
      paymentId: payment.id,
      action: 'PAY',
      actingUserId: USER_ID,
      access: administrator({ userId: USER_ID, tenantId: TENANT_ID }),
    });

    const [entry] = harness.recordedAuditEntries();
    expect(entry.entityType).toBe('ContractPayment');
    expect(entry.action).toBe(AuditAction.StatusChange);
    expect(entry.changes.find((c) => c.field === 'status')).toEqual({
      field: 'status',
      old: 'PAYMENT_PENDING',
      new: 'PAID',
    });
  });

  it('FR-AUD-02 records the reversal when a payment is marked UNPAY', async () => {
    const harness = makeContractWriteHarness();
    const contract = draftContract({ status: ContractStatus.Active });
    const payment = draftPayment({ contractId: contract.id, status: PaymentStatus.Paid, paidAmount: 100, paidAt: new Date() });
    harness.contractRepo.findById.mockResolvedValue(contract);
    harness.paymentRepo.findById.mockResolvedValue(payment);
    const useCase = new RecordContractPaymentUseCase(harness.writeTx, scopeResolver());

    await useCase.execute({
      tenantId: TENANT_ID,
      contractId: contract.id,
      paymentId: payment.id,
      action: 'UNPAY',
      actingUserId: USER_ID,
      access: administrator({ userId: USER_ID, tenantId: TENANT_ID }),
    });

    const [entry] = harness.recordedAuditEntries();
    expect(entry.changes.find((c) => c.field === 'status')).toEqual({
      field: 'status',
      old: 'PAID',
      new: 'PAYMENT_PENDING',
    });
  });
});

describe('AddContractPaymentUseCase audit trail', () => {
  it('FR-AUD-02 records a CREATE entry for the new payment row', async () => {
    const harness = makeContractWriteHarness();
    const contract = draftContract({ status: ContractStatus.Active });
    harness.contractRepo.findById.mockResolvedValue(contract);
    const useCase = new AddContractPaymentUseCase(harness.writeTx, scopeResolver());

    await useCase.execute({
      tenantId: TENANT_ID,
      contractId: contract.id,
      dueDate: new Date('2026-03-01T00:00:00.000Z'),
      amount: 50,
      actingUserId: USER_ID,
      access: administrator({ userId: USER_ID, tenantId: TENANT_ID }),
    });

    const [entry] = harness.recordedAuditEntries();
    expect(entry.action).toBe(AuditAction.Create);
    expect(entry.entityType).toBe('ContractPayment');
  });
});

describe('UpdateContractPaymentUseCase audit trail', () => {
  it('FR-AUD-02 records an UPDATE entry with the changed fields', async () => {
    const harness = makeContractWriteHarness();
    const contract = draftContract({ status: ContractStatus.Active });
    const payment = draftPayment({ contractId: contract.id });
    harness.contractRepo.findById.mockResolvedValue(contract);
    harness.paymentRepo.findById.mockResolvedValue(payment);
    const useCase = new UpdateContractPaymentUseCase(harness.writeTx, scopeResolver());

    await useCase.execute({
      tenantId: TENANT_ID,
      contractId: contract.id,
      paymentId: payment.id,
      amount: 75,
      actingUserId: USER_ID,
      access: administrator({ userId: USER_ID, tenantId: TENANT_ID }),
    });

    const [entry] = harness.recordedAuditEntries();
    expect(entry.action).toBe(AuditAction.Update);
    expect(entry.changes).toEqual([{ field: 'amount', old: 100, new: 75 }]);
  });

  it('FR-AUD-03 records nothing when nothing changed', async () => {
    const harness = makeContractWriteHarness();
    const contract = draftContract({ status: ContractStatus.Active });
    const payment = draftPayment({ contractId: contract.id });
    harness.contractRepo.findById.mockResolvedValue(contract);
    harness.paymentRepo.findById.mockResolvedValue(payment);
    const useCase = new UpdateContractPaymentUseCase(harness.writeTx, scopeResolver());

    await useCase.execute({
      tenantId: TENANT_ID,
      contractId: contract.id,
      paymentId: payment.id,
      amount: payment.amount,
      actingUserId: USER_ID,
      access: administrator({ userId: USER_ID, tenantId: TENANT_ID }),
    });

    expect(harness.recordedAuditEntries()).toHaveLength(0);
  });
});

describe('DeleteContractPaymentUseCase audit trail', () => {
  it('FR-AUD-02 records a DELETE entry with no new value', async () => {
    const harness = makeContractWriteHarness();
    const contract = draftContract({ status: ContractStatus.Active });
    const payment = draftPayment({ contractId: contract.id });
    harness.contractRepo.findById.mockResolvedValue(contract);
    harness.paymentRepo.findById.mockResolvedValue(payment);
    const useCase = new DeleteContractPaymentUseCase(harness.writeTx, scopeResolver());

    await useCase.execute({
      tenantId: TENANT_ID,
      contractId: contract.id,
      paymentId: payment.id,
      actingUserId: USER_ID,
      access: administrator({ userId: USER_ID, tenantId: TENANT_ID }),
    });

    const [entry] = harness.recordedAuditEntries();
    expect(entry.action).toBe(AuditAction.Delete);
    expect(entry.changes.every((change) => change.new === null)).toBe(true);
  });
});
