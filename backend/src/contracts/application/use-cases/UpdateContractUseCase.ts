import { AccessContext } from '../../../access/domain/AccessContext';
import { randomUUID } from 'crypto';
import { BillingPeriod, ContractStatus } from '../../domain/Contract';
import { ContractStatusHistory } from '../../domain/ContractStatusHistory';
import { IContractWriteTransaction } from '../ports/IContractWriteTransaction';
import { reachableContract } from './contractAccess';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';

/**
 * Edits a contract's terms.
 *
 * Refused outright on a terminal contract. An EXPIRED or CANCELLED term is the
 * record of what was actually sold and collected; editing last year's price
 * after the fact would make the payment rows beneath it describe a deal that
 * never existed. Renew instead — that is what `RenewContractUseCase` is for.
 *
 * Editing an ACTIVE contract IS allowed, because typos in a live term are real
 * and the alternative (cancel and re-sell) is worse. Its already-generated
 * payment rows are left alone deliberately: they are what the customer was
 * actually billed, and a price correction going forward must not silently
 * restate months that have already been paid. The response reports the
 * mismatch so the UI can offer to fix the remaining instalments explicitly.
 */
export class UpdateContractUseCase {
  constructor(
    private writeTx: IContractWriteTransaction,
    private scopes: RecordScopeResolver
  ) {}

  async execute(input: {
    tenantId: string;
    contractId: string;
    planName?: string;
    amount?: number;
    billingPeriod?: BillingPeriod;
    startsAt?: Date;
    endsAt?: Date;
    assignedUserId?: string | null;
    notes?: string | null;
    actingUserId: string;
    access: AccessContext;
  }) {
    const scope = await this.scopes.resolve(input.access, 'contracts.manage');
    return this.writeTx.run(async (repos) => {
      // Out of scope reads as not found (FR-RBAC-05, 11).
      const contract = reachableContract(await repos.contractRepo.findById(input.tenantId, input.contractId), scope);

      if (contract.status === ContractStatus.Expired || contract.status === ContractStatus.Cancelled) {
        throw new Error(`A ${contract.status} contract can no longer be edited`);
      }

      const before = {
        planName: contract.planName,
        amount: contract.amount,
        billingPeriod: contract.billingPeriod,
        startsAt: contract.startsAt.getTime(),
        endsAt: contract.endsAt.getTime(),
      };

      contract.applyEdits({
        planName: input.planName,
        amount: input.amount,
        billingPeriod: input.billingPeriod,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        assignedUserId: input.assignedUserId,
        notes: input.notes,
      });

      await repos.contractRepo.save(contract);

      // Terms changing on a live contract is worth an audit row even though
      // the status did not move — `fromStatus === toStatus` is how this module
      // already records non-transitions (see CreateContractUseCase).
      const priceOrDatesMoved =
        before.amount !== contract.amount ||
        before.billingPeriod !== contract.billingPeriod ||
        before.startsAt !== contract.startsAt.getTime() ||
        before.endsAt !== contract.endsAt.getTime();

      if (priceOrDatesMoved) {
        await repos.historyRepo.save(
          ContractStatusHistory.create({
            id: randomUUID(),
            tenantId: input.tenantId,
            contractId: contract.id,
            fromStatus: contract.status,
            toStatus: contract.status,
            changedByUserId: input.actingUserId,
            note: 'Contract terms updated',
          })
        );
      }

      const payments = await repos.paymentRepo.findByContractId(input.tenantId, contract.id);
      const unsettledAtOldPrice = payments.filter(
        (payment) => payment.outstanding > 0 && payment.amount !== contract.amount
      ).length;

      return { contract, scheduleNeedsReview: priceOrDatesMoved && unsettledAtOldPrice > 0 };
    });
  }
}
