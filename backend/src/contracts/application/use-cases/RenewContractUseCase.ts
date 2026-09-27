import { randomUUID } from 'crypto';
import { BillingPeriod, Contract, ContractStatus } from '../../domain/Contract';
import { ContractStatusHistory } from '../../domain/ContractStatusHistory';
import { IContractWriteTransaction } from '../ports/IContractWriteTransaction';
import { assertCanAccessContract } from './contractAccess';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { diff } from '../../../audit/domain/diff';
import { CONTRACT_AUDIT_FIELDS, contractLabel, contractSnapshot } from './contractAudit';

/** One day, for stepping the new term off the end of the previous one. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Sells the next term.
 *
 * Creates a NEW contract pointing back at the old one rather than moving the
 * old one's dates forward. That is the whole reason renewal is a separate use
 * case: mutating `endsAt` in place would silently rewrite history — last
 * year's price, last year's plan and last year's payment schedule would all
 * become claims about this year.
 *
 * The new term is a DRAFT. It inherits the previous plan, price and period as
 * defaults, and every one of them is overridable, because a renewal is exactly
 * the moment a price changes.
 */
export class RenewContractUseCase {
  constructor(private writeTx: IContractWriteTransaction) {}

  async execute(input: {
    tenantId: string;
    contractId: string;
    planName?: string;
    amount?: number;
    billingPeriod?: BillingPeriod;
    startsAt?: Date;
    endsAt?: Date;
    notes?: string | null;
    actingUserId: string;
    actingUserRole: string;
  }) {
    return this.writeTx.run(async (repos) => {
      const previous = await repos.contractRepo.findById(input.tenantId, input.contractId);
      if (!previous) {
        throw new Error('Contract not found');
      }

      assertCanAccessContract(previous, input.actingUserId, input.actingUserRole);

      if (!previous.canRenew()) {
        throw new Error(
          `A ${previous.status} contract cannot be renewed; it must end or be cancelled first`
        );
      }

      // Default: the new term picks up the day after the old one ended, so
      // there is no gap and no overlap in coverage.
      const startsAt = input.startsAt ?? new Date(previous.endsAt.getTime() + DAY_MS);
      // Default: the same length of term as before, measured from the previous
      // term's own span rather than assumed to be a year — a six-month deal
      // renews into six months.
      const previousSpan = previous.endsAt.getTime() - previous.startsAt.getTime();
      const endsAt = input.endsAt ?? new Date(startsAt.getTime() + previousSpan);

      const renewal = Contract.create({
        id: randomUUID(),
        tenantId: input.tenantId,
        clientId: previous.clientId,
        planName: input.planName ?? previous.planName,
        amount: input.amount ?? previous.amount,
        billingPeriod: input.billingPeriod ?? previous.billingPeriod,
        startsAt,
        endsAt,
        assignedUserId: previous.assignedUserId,
        notes: input.notes ?? null,
        renewedFromContractId: previous.id,
        createdByUserId: input.actingUserId,
      });

      await repos.contractRepo.save(renewal);

      await repos.historyRepo.save(
        ContractStatusHistory.create({
          id: randomUUID(),
          tenantId: input.tenantId,
          contractId: renewal.id,
          fromStatus: ContractStatus.Draft,
          toStatus: ContractStatus.Draft,
          changedByUserId: input.actingUserId,
          note: `Renewed from contract ${previous.id}`,
        })
      );

      // Also recorded against the OLD term, so opening a finished contract
      // shows that it was renewed rather than leaving the trail only on the
      // successor, which nobody looking at the predecessor would find.
      await repos.historyRepo.save(
        ContractStatusHistory.create({
          id: randomUUID(),
          tenantId: input.tenantId,
          contractId: previous.id,
          fromStatus: previous.status,
          toStatus: previous.status,
          changedByUserId: input.actingUserId,
          note: `Renewed into contract ${renewal.id}`,
        })
      );

      // Re-read for the hydrated shape, same reason as CreateContractUseCase.
      const saved = await repos.contractRepo.findById(input.tenantId, renewal.id);
      const result = saved ?? renewal;

      await repos.auditTrail.record({
        tenantId: input.tenantId,
        userId: input.actingUserId,
        userRole: input.actingUserRole,
        action: AuditAction.Create,
        entityType: 'Contract',
        entityId: renewal.id,
        entityLabel: contractLabel(result),
        changes: diff({} as Record<string, unknown>, contractSnapshot(result), [...CONTRACT_AUDIT_FIELDS]),
      });

      return { contract: result, previousContractId: previous.id };
    });
  }
}
