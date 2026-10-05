import { AccessContext } from '../../../access/domain/AccessContext';
import { randomUUID } from 'crypto';
import { BillingPeriod, ContractStatus, ContractTerms } from '../../domain/Contract';
import { ContractStatusHistory } from '../../domain/ContractStatusHistory';
import { IContractWriteTransaction } from '../ports/IContractWriteTransaction';
import { InvalidRichTextError, sanitizeRichText } from '../../../shared/application/richText/sanitizeRichText';
import { ContractValidationError } from '../../domain/contractErrors';
import { reachableContract } from './contractAccess';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { diff } from '../../../audit/domain/diff';
import { CONTRACT_AUDIT_FIELDS, contractLabel, contractSnapshot } from './contractAudit';

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
    renewalDate?: Date | null;
    termsText?: ContractTerms | null;
    actingUserId: string;
    access: AccessContext;
  }) {
    const scope = await this.scopes.resolve(input.access, 'contracts.manage');
    const termsText = this.cleanTerms(input.termsText);
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
      const auditBefore = contractSnapshot(contract);

      contract.applyEdits({
        planName: input.planName,
        amount: input.amount,
        billingPeriod: input.billingPeriod,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        assignedUserId: input.assignedUserId,
        notes: input.notes,
        renewalDate: input.renewalDate,
        termsText,
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

      const auditChanges = diff(auditBefore, contractSnapshot(contract), [...CONTRACT_AUDIT_FIELDS]);
      if (auditChanges.length > 0) {
        await repos.auditTrail.record({
          tenantId: input.tenantId,
          userId: input.actingUserId,
          userRole: input.access.auditRole,
          action: AuditAction.Update,
          entityType: 'Contract',
          entityId: contract.id,
          entityLabel: contractLabel(contract),
          changes: auditChanges,
        });
      }

      return { contract, scheduleNeedsReview: priceOrDatesMoved && unsettledAtOldPrice > 0 };
    });
  }

  /** The terms are rich text: only the editor's whitelist is kept (M2 D10, NFR-SEC-05). */
  private cleanTerms(terms: ContractTerms | null | undefined): ContractTerms | null | undefined {
    if (!terms) return terms;
    try {
      return { sq: sanitizeRichText(terms.sq) as ContractTerms['sq'], en: sanitizeRichText(terms.en) as ContractTerms['en'] };
    } catch (error) {
      if (error instanceof InvalidRichTextError) throw new ContractValidationError('termsText', error.message);
      throw error;
    }
  }
}
