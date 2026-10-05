import { randomUUID } from 'crypto';
import { AccessContext } from '../../../access/domain/AccessContext';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { diff } from '../../../audit/domain/diff';
import { NotificationService } from '../../../notifications/application/NotificationService';
import { ITenantRepository } from '../../../tenant/domain/repositories/ITenantRepository';
import { dayKeyInZone } from '../../../shared/domain/time/tenantDay';
import { Money } from '../../../pricing/domain/Money';
import { Contract, ContractStatus, findContractTransition } from '../../domain/Contract';
import { ContractPayment, PaymentStatus } from '../../domain/ContractPayment';
import { ContractStatusHistory } from '../../domain/ContractStatusHistory';
import { ContractValidationError } from '../../domain/contractErrors';
import { buildInstalmentSchedule } from '../../domain/paymentSchedule';
import { IContractWriteTransaction } from '../ports/IContractWriteTransaction';
import { reachableContract } from './contractAccess';
import { CONTRACT_AUDIT_FIELDS, contractLabel, contractSnapshot } from './contractAudit';

/**
 * Every status change a person makes to a contract (FR-CON-11..15, 18).
 *
 * One use case, so the rules cannot differ between buttons: the move must be in
 * the transition table, the person needs the permission the table names
 * (`contracts.manage`, or `contracts.terminate` for suspending, reinstating and
 * cancelling anything but a Draft), a reason is stored where the table asks
 * for one, and the status history, the audit entry and the side effects below
 * are written in the same transaction.
 *
 * Side effects of the move:
 * - Active from Draft or Pending Signature generates the instalments, all
 *   Not Invoiced and none Paid, and makes the company a Client (FR-CON-13,
 *   FR-PAY-01, FR-PAY-02). Reinstating from Suspended changes no instalment.
 * - Cancelled removes the Not Invoiced instalments due after today; anything
 *   invoiced, partly paid or paid stays for an authorized user to settle or
 *   correct (FR-CON-15, D15).
 *
 * Suspending and cancelling notify the salesperson and the people who hold
 * `contracts.terminate` over the company, once the change is committed.
 */
export class ChangeContractStatusUseCase {
  constructor(
    private readonly writeTx: IContractWriteTransaction,
    private readonly scopes: RecordScopeResolver,
    private readonly tenants: ITenantRepository,
    private readonly notifications?: NotificationService,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: {
    tenantId: string;
    contractId: string;
    status: ContractStatus;
    reason?: string | null;
    actingUserId: string;
    access: AccessContext;
  }) {
    const tenant = await this.tenants.findById(input.tenantId);
    const manageScope = await this.scopes.resolve(input.access, 'contracts.manage');
    const now = this.now();
    const today = new Date(`${dayKeyInZone(now, tenant?.timezone ?? 'UTC')}T00:00:00Z`);

    const result = await this.writeTx.run(async (repos) => {
      // Out of scope reads as not found (FR-RBAC-05, 11).
      const contract = reachableContract(await repos.contractRepo.findById(input.tenantId, input.contractId), manageScope);
      const transition = findContractTransition(contract.status, input.status);
      if (!transition) {
        throw new ContractValidationError('status', `A contract cannot go from ${contract.status} to ${input.status}.`);
      }
      if (transition.permission === 'contracts.terminate') {
        if (!input.access.can('contracts.terminate')) {
          throw new PermissionDeniedError('contracts.terminate', 'You do not have permission to change this contract this way.');
        }
        reachableContract(contract, await this.scopes.resolve(input.access, 'contracts.terminate'));
      }

      const before = contractSnapshot(contract);
      const hasSignedDocument = (await repos.documentRepo.findCurrent(input.tenantId, contract.id)) !== null;
      const { from, reason } = contract.changeStatus(input.status, {
        reason: input.reason,
        documentRequired: tenant?.runsSalesProcess() ?? false,
        hasSignedDocument,
        now,
      });

      const extra: Array<{ field: string; old: unknown; new: unknown }> = [];
      let note = reason;

      if (input.status === ContractStatus.Active && from !== ContractStatus.Suspended) {
        const generated = await this.generateInstalments(repos, contract, input.tenantId);
        if (generated > 0) {
          extra.push({ field: 'generatedPayments', old: 0, new: generated });
          note = `${reason ? `${reason}; ` : ''}${generated} scheduled payment(s) created`;
        }
        const company = await repos.companyStatus.makeClient(input.tenantId, contract.clientId);
        if (company) {
          await repos.auditTrail.record({
            tenantId: input.tenantId,
            userId: input.actingUserId,
            userRole: input.access.auditRole,
            action: AuditAction.Update,
            entityType: 'Client',
            entityId: contract.clientId,
            entityLabel: contract.clientName ?? contract.clientId,
            changes: [{ field: 'status', old: company.previous, new: 'CLIENT' }],
          });
        }
      }

      if (input.status === ContractStatus.Cancelled) {
        const removed = await repos.paymentRepo.deleteNotInvoicedDueAfter(input.tenantId, contract.id, today);
        if (removed > 0) extra.push({ field: 'removedPayments', old: removed, new: 0 });
      }

      await repos.contractRepo.save(contract);
      await repos.historyRepo.save(
        ContractStatusHistory.create({
          id: randomUUID(),
          tenantId: input.tenantId,
          contractId: contract.id,
          fromStatus: from,
          toStatus: contract.status,
          changedByUserId: input.actingUserId,
          note,
          changedAt: now,
        })
      );
      // One entry for the move and what it did to the instalments (FR-AUD-11).
      await repos.auditTrail.record({
        tenantId: input.tenantId,
        userId: input.actingUserId,
        userRole: input.access.auditRole,
        action: AuditAction.StatusChange,
        entityType: 'Contract',
        entityId: contract.id,
        entityLabel: contractLabel(contract),
        changes: [...diff(before, contractSnapshot(contract), [...CONTRACT_AUDIT_FIELDS]), ...extra],
      });

      const generatedPayments = extra.find((c) => c.field === 'generatedPayments')?.new as number | undefined;
      return { contract, generatedPayments: generatedPayments ?? 0 };
    });

    await this.notify(input, result.contract);
    return result;
  }

  /** The schedule is laid out once: a contract that somehow already has rows is not billed twice (FR-PAY-02). */
  private async generateInstalments(
    repos: Parameters<Parameters<IContractWriteTransaction['run']>[0]>[0],
    contract: Contract,
    tenantId: string
  ): Promise<number> {
    if ((await repos.paymentRepo.findByContractId(tenantId, contract.id)).length > 0) return 0;
    const schedule = buildInstalmentSchedule({
      billingPeriod: contract.billingPeriod,
      monthlyPrice: Money.of(contract.amount),
      startsAt: contract.startsAt,
      endsAt: contract.endsAt,
    });
    const payments = schedule.map((instalment) =>
      ContractPayment.create({
        id: randomUUID(),
        tenantId,
        contractId: contract.id,
        periodIndex: instalment.periodIndex,
        dueDate: instalment.dueDate,
        amount: Number(instalment.amount.toString()),
        status: PaymentStatus.NotInvoiced,
        paidAmount: 0,
      })
    );
    await repos.paymentRepo.saveMany(payments);
    return payments.length;
  }

  private async notify(input: { tenantId: string; actingUserId: string; status: ContractStatus }, contract: Contract) {
    const type =
      input.status === ContractStatus.Suspended
        ? 'CONTRACT_SUSPENDED'
        : input.status === ContractStatus.Cancelled
          ? 'CONTRACT_CANCELLED'
          : null;
    if (!type || !this.notifications) return;
    await this.notifications.emitSafe({
      tenantId: input.tenantId,
      // The responsible salesperson (the company's owner, and the contract's if it names another).
      recipientUserIds: [contract.assignedUserId, contract.clientAssignedUserId].filter((id): id is string => !!id),
      toPermission: { key: 'contracts.terminate', subjectOwnerId: contract.clientAssignedUserId ?? null },
      type,
      params: {
        clientName: contract.clientName ?? '',
        planName: contract.planName,
        number: contract.number ?? '',
        reason: (type === 'CONTRACT_SUSPENDED' ? contract.suspensionReason : contract.cancelReason) ?? '',
      },
      actorUserId: input.actingUserId,
      entityType: 'CONTRACT',
      entityId: contract.id,
    });
  }
}
