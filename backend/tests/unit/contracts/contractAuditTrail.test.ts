import { randomUUID } from 'crypto';
import { ITenantRepository } from '../../../src/tenant/domain/repositories/ITenantRepository';
import { Contract, ContractStatus, BillingPeriod } from '../../../src/contracts/domain/Contract';
import { ContractPayment, PaymentStatus } from '../../../src/contracts/domain/ContractPayment';
import { ChangeContractStatusUseCase } from '../../../src/contracts/application/use-cases/ChangeContractStatusUseCase';
import { RenewContractUseCase } from '../../../src/contracts/application/use-cases/RenewContractUseCase';
import { UpdateContractUseCase } from '../../../src/contracts/application/use-cases/UpdateContractUseCase';
import { ExpireContractUseCase } from '../../../src/contracts/application/use-cases/ExpireContractUseCase';
import { CreateContractUseCase } from '../../../src/contracts/application/use-cases/CreateContractUseCase';
import {
  AddContractPaymentUseCase,
  DeleteContractPaymentUseCase,
  RecordReceiptUseCase,
  ReverseReceiptUseCase,
  UpdateContractPaymentUseCase,
} from '../../../src/contracts/application/use-cases/InstalmentUseCases';
import { makeContractWriteHarness } from '../../support/fakeContractWriteTransaction';
import { AuditAction } from '../../../src/audit/domain/AuditAction';
import { administrator, salesUser, scopeResolver } from '../../support/access';

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

describe('ChangeContractStatusUseCase audit trail (activate)', () => {
  it('FR-AUD-02 records exactly one STATUS_CHANGE entry for status DRAFT to ACTIVE', async () => {
    const harness = makeContractWriteHarness();
    const contract = draftContract();
    harness.contractRepo.findById.mockResolvedValue(contract);
    const useCase = new ChangeContractStatusUseCase(harness.writeTx, scopeResolver(), tenantsWorkflow('LEGACY_QUOTATIONS'));

    await useCase.execute({
      tenantId: TENANT_ID,
      contractId: contract.id,
      status: ContractStatus.Active,
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

describe('ChangeContractStatusUseCase audit trail (cancel)', () => {
  it('FR-AUD-02 records a STATUS_CHANGE entry and carries the reason', async () => {
    const harness = makeContractWriteHarness();
    const contract = draftContract({ status: ContractStatus.Active });
    harness.contractRepo.findById.mockResolvedValue(contract);
    const useCase = new ChangeContractStatusUseCase(harness.writeTx, scopeResolver(), tenantsWorkflow('LEGACY_QUOTATIONS'));

    await useCase.execute({
      tenantId: TENANT_ID,
      contractId: contract.id,
      status: ContractStatus.Cancelled,
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
    const useCase = new RenewContractUseCase(harness.writeTx, scopeResolver(), {
      findById: jest.fn().mockResolvedValue({ runsSalesProcess: () => false }),
    } as unknown as ITenantRepository);

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

    await useCase.execute({ tenantId: TENANT_ID, contractId: contract.id, today: new Date('2999-01-01T00:00:00Z'), now: new Date('2999-01-01T10:00:00Z') });

    const [entry] = harness.recordedAuditEntries();
    expect(entry.action).toBe(AuditAction.StatusChange);
    expect(entry.userId).toBeNull();
    expect(entry.userRole).toBe('SYSTEM');
  });
});

const tenants = { findById: jest.fn().mockResolvedValue({ timezone: 'UTC' }) } as any;
const NOW = new Date('2026-03-10T10:00:00.000Z');
const admin = () => administrator({ userId: USER_ID, tenantId: TENANT_ID });

describe('Instalment actions audit trail (FR-AUD-11)', () => {
  const setup = (paymentOverrides: Partial<Parameters<typeof ContractPayment.create>[0]> = {}) => {
    const harness = makeContractWriteHarness();
    const contract = draftContract({ status: ContractStatus.Active });
    const payment = draftPayment({ contractId: contract.id, status: PaymentStatus.PaymentPending, ...paymentOverrides });
    harness.contractRepo.findById.mockResolvedValue(contract);
    harness.paymentRepo.findById.mockResolvedValue(payment);
    return { harness, contract, payment };
  };

  it('a receipt records one STATUS_CHANGE entry and one history row', async () => {
    const { harness, contract, payment } = setup();
    await new RecordReceiptUseCase(harness.writeTx, tenants, () => NOW).execute({
      tenantId: TENANT_ID, contractId: contract.id, paymentId: payment.id,
      amount: '100.00', receivedOn: '2026-03-10', method: 'CASH', actingUserId: USER_ID, access: admin(),
    });

    const entries = harness.recordedAuditEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].entityType).toBe('ContractPayment');
    expect(entries[0].action).toBe(AuditAction.StatusChange);
    expect(entries[0].changes.find((c) => c.field === 'status')).toEqual({ field: 'status', old: 'PAYMENT_PENDING', new: 'PAID' });
    expect(harness.paymentHistoryRepo.save).toHaveBeenCalledTimes(1);
    expect(harness.paymentHistoryRepo.save.mock.calls[0][0]).toMatchObject({ fromStatus: 'PAYMENT_PENDING', toStatus: 'PAID', changedByUserId: USER_ID });
  });

  it('reversing a receipt records the way back', async () => {
    const { harness, contract, payment } = setup({ status: PaymentStatus.Paid, paidAmount: 100, invoiceNumber: 'INV-1' });
    await new ReverseReceiptUseCase(harness.writeTx, tenants, () => NOW).execute({
      tenantId: TENANT_ID, contractId: contract.id, paymentId: payment.id,
      amount: '100.00', comment: 'Bounced', actingUserId: USER_ID, access: admin(),
    });
    const [entry] = harness.recordedAuditEntries();
    expect(entry.changes.find((c) => c.field === 'status')).toEqual({ field: 'status', old: 'PAID', new: 'PAYMENT_PENDING' });
    expect(harness.paymentHistoryRepo.save.mock.calls[0][0].amountReceived.toString()).toBe('-100.00');
  });

  it('adding an instalment records a CREATE entry with the reason', async () => {
    const { harness, contract } = setup();
    await new AddContractPaymentUseCase(harness.writeTx, tenants, () => NOW).execute({
      tenantId: TENANT_ID, contractId: contract.id, dueDate: '2026-03-01', amount: '50.00', reason: 'Set-up fee',
      actingUserId: USER_ID, access: admin(),
    });
    const [entry] = harness.recordedAuditEntries();
    expect(entry.action).toBe(AuditAction.Create);
    expect(entry.changes).toContainEqual({ field: 'reason', old: null, new: 'Set-up fee' });
    expect(harness.paymentHistoryRepo.save.mock.calls[0][0]).toMatchObject({ fromStatus: 'NONE', toStatus: 'NOT_INVOICED', comment: 'Set-up fee' });
  });

  it('changing the amount records an UPDATE entry with the changed fields and the reason', async () => {
    const { harness, contract, payment } = setup();
    await new UpdateContractPaymentUseCase(harness.writeTx, tenants, () => NOW).execute({
      tenantId: TENANT_ID, contractId: contract.id, paymentId: payment.id, amount: '75.00', reason: 'Agreed discount',
      actingUserId: USER_ID, access: admin(),
    });
    const [entry] = harness.recordedAuditEntries();
    expect(entry.action).toBe(AuditAction.Update);
    expect(entry.changes).toEqual([
      { field: 'amount', old: 100, new: 75 },
      { field: 'reason', old: null, new: 'Agreed discount' },
    ]);
  });

  it('removing an instalment records a DELETE entry with no new value', async () => {
    const { harness, contract, payment } = setup();
    await new DeleteContractPaymentUseCase(harness.writeTx, tenants, () => NOW).execute({
      tenantId: TENANT_ID, contractId: contract.id, paymentId: payment.id, reason: 'Entered twice',
      actingUserId: USER_ID, access: admin(),
    });
    const [entry] = harness.recordedAuditEntries();
    expect(entry.action).toBe(AuditAction.Delete);
    expect(entry.changes.filter((change) => change.field !== 'reason').every((change) => change.new === null)).toBe(true);
    expect(harness.paymentRepo.delete).toHaveBeenCalledWith(TENANT_ID, payment.id);
  });

  it('FR-PAY-05 a user without payments.update is refused inside the use case, and nothing is written', async () => {
    const { harness, contract, payment } = setup();
    await expect(
      new RecordReceiptUseCase(harness.writeTx, tenants, () => NOW).execute({
        tenantId: TENANT_ID, contractId: contract.id, paymentId: payment.id,
        amount: '10.00', receivedOn: '2026-03-10', method: 'CASH', actingUserId: USER_ID, access: salesUser({ userId: USER_ID, tenantId: TENANT_ID }),
      })
    ).rejects.toThrow(/permission/i);
    expect(harness.paymentRepo.save).not.toHaveBeenCalled();
    expect(harness.recordedAuditEntries()).toHaveLength(0);
  });
});
