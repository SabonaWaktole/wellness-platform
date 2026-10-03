import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { DiscountApprovalNotFoundError, DiscountApprovalTransitionError } from '../../../discounts/domain/errors';
import { QuotationStatus } from '../../domain/Quotation';
import { EDIT_OFFERS, withActions } from './offerAccess';
import { actorOf, offerAuditLabel, offerInScope, recordOfferChange } from './offerChanges';
import { OfferView } from './offerViews';
import { IOfferStore } from './ports/IOfferStore';
import { IOfferWriteTransaction } from './ports/IOfferWriteTransaction';

/**
 * Withdrawing a pending discount request (FR-DSC-10).
 *
 * Only the salesperson who requested it may withdraw it; the offer returns
 * to draft with the requested discount kept, so they can lower it or ask
 * again. The withdrawal leaves the approver's list and is audited (FR-DSC-11).
 */
export class WithdrawDiscountApprovalUseCase {
  constructor(
    private readonly writeTx: IOfferWriteTransaction,
    private readonly scopes: RecordScopeResolver,
    private readonly store: IOfferStore,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; approvalId: string }): Promise<OfferView> {
    const { access, tenantId, approvalId } = input;
    access.ensure(EDIT_OFFERS);
    const now = this.now();
    let offerId = '';
    await this.writeTx.run(async (repos) => {
      const approval = await repos.approvals.find(tenantId, approvalId);
      if (!approval) throw new DiscountApprovalNotFoundError();
      if (approval.toProps().status !== 'PENDING') {
        throw new DiscountApprovalTransitionError('Only a pending request can be withdrawn.');
      }
      const props = approval.toProps();
      if (props.requestedByUserId !== access.userId) {
        throw new DiscountApprovalTransitionError('Only the salesperson who requested it can withdraw it.');
      }
      offerId = props.quotationId;
      const { offer } = await offerInScope(repos, this.scopes, access, tenantId, props.quotationId);
      if (offer.status !== QuotationStatus.PendingApproval) {
        throw new DiscountApprovalTransitionError('The offer no longer waits for approval.');
      }
      approval.withdraw(now);
      offer.withdrawPending(now);
      await repos.approvals.update(approval);
      await repos.offers.saveStatus(offer);
      await recordOfferChange(repos, offer, QuotationStatus.PendingApproval, actorOf(access));
      await repos.auditTrail.record({
        tenantId,
        userId: access.userId,
        userRole: access.auditRole,
        action: AuditAction.StatusChange,
        entityType: 'DiscountApproval',
        entityId: props.id,
        entityLabel: await offerAuditLabel(repos, offer),
        changes: [
          { field: 'status', old: 'PENDING', new: 'WITHDRAWN' },
          { field: 'requestedPercent', old: null, new: props.requestedPercent.toString() },
          { field: 'listPriceAtRequest', old: null, new: props.listPriceAtRequest.toString() },
        ],
      });
    });
    const [view] = await withActions([(await this.store.find(tenantId, offerId))!], access, this.scopes);
    return view;
  }
}
