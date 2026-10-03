import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { admits } from '../../../access/domain/RecordScope';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { IUserRepository } from '../../../auth/domain/repositories/IUserRepository';
import { Deal } from '../../../deals/domain/Deal';
import { DiscountApproval as DiscountApprovalEntity } from '../../../discounts/domain/DiscountApproval';
import { DiscountApprovalTransitionError, DiscountApprovalNotFoundError, SelfApprovalError } from '../../../discounts/domain/errors';
import { Notification } from '../../../notifications/domain/Notification';
import { NotificationService } from '../../../notifications/application/NotificationService';
import { IPermissionHolderDirectory } from '../../../notifications/application/ports/IPermissionHolderDirectory';
import { PriceCalculator } from '../../../pricing/domain/PriceCalculator';
import { Percent } from '../../../pricing/domain/Percent';
import { parsePercent } from '../../../pricing/domain/PricingValues';
import { Offer, OfferAmounts } from '../../domain/Offer';
import { quotationReference } from '../../domain/quotationReference';
import { QuotationStatus } from '../../domain/Quotation';
import { APPROVE_DISCOUNTS, withActions } from './offerAccess';
import { actorOf, offerAuditLabel, offerInScope, recordOfferChange } from './offerChanges';
import { OfferView } from './offerViews';
import { IOfferDocumentSource } from './ports/IOfferDocumentSource';
import { IOfferStore } from './ports/IOfferStore';
import { IOfferWriteTransaction, OfferWriteRepos } from './ports/IOfferWriteTransaction';

export const DECISION_COMMENT_MAX = 2000;

export type DiscountDecisionInput =
  | { kind: 'APPROVE'; approvedPercent?: unknown; comment?: string | null }
  | { kind: 'REJECT'; comment: string };

/**
 * Deciding a discount above the cap (FR-DSC-06, 07, 09).
 *
 * Approve takes the approved percent — the requested one, or a lower one —
 * onto the offer and makes it Ready; reject returns the offer to draft with
 * the discount set back to the cap it was priced with, and the comment shown.
 * The approver cannot be the requester (FR-DSC-09), and deciding needs
 * `discounts.approve` in scope on the deal's salesperson (FR-DSC-06,
 * NFR-SEC-04). The salesperson is notified either way (FR-DSC-07).
 */
export class DecideDiscountApprovalUseCase {
  constructor(
    private readonly writeTx: IOfferWriteTransaction,
    private readonly scopes: RecordScopeResolver,
    private readonly documents: IOfferDocumentSource,
    private readonly store: IOfferStore,
    private readonly users: IUserRepository,
    private readonly permissionDirectory: IPermissionHolderDirectory,
    private readonly emailDispatcher: { dispatch(notifications: Notification[]): Promise<void> },
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: {
    access: AccessContext;
    tenantId: string;
    approvalId: string;
    decision: DiscountDecisionInput;
  }): Promise<OfferView> {
    const { access, tenantId, approvalId, decision } = input;
    access.ensure(APPROVE_DISCOUNTS);
    const now = this.now();
    const pending: Notification[] = [];
    let offerId = '';
    await this.writeTx.run(async (repos) => {
      const approval = await repos.approvals.find(tenantId, approvalId);
      if (!approval) throw new DiscountApprovalNotFoundError();
      if (approval.toProps().status !== 'PENDING') {
        throw new DiscountApprovalTransitionError('Only a pending request can be decided.');
      }
      const props = approval.toProps();
      offerId = props.quotationId;
      const { offer, deal } = await offerInScope(repos, this.scopes, access, tenantId, props.quotationId);
      await this.ensureInScope(access, deal.ownerUserId);
      if (access.userId === props.requestedByUserId) throw new SelfApprovalError();
      if (offer.status !== QuotationStatus.PendingApproval) {
        throw new DiscountApprovalTransitionError('The offer no longer waits for approval.');
      }
      const amounts = offer.amounts;
      if (!amounts) throw new DiscountApprovalTransitionError('An offer without a price cannot be approved.');
      const cap = Percent.of(String(offer.toProps().ruleSnapshot.discountCapPercent ?? '0'));
      const contractMonths = Number(offer.toProps().ruleSnapshot.contractMonths ?? 12);
      const companyName = (await repos.deals.companyName(tenantId, offer.toProps().clientId)) ?? '';

      const details = await this.documents.current(tenantId, {
        clientId: offer.toProps().clientId,
        contactPersonId: offer.toProps().contactPersonId,
        salespersonUserId: deal.ownerUserId,
      });

      if (decision.kind === 'APPROVE') {
        const approvedPercent =
          decision.approvedPercent === undefined
            ? props.requestedPercent
            : Percent.of(parsePercent(decision.approvedPercent, 'approvedPercent', 100));
        approval.approve({ decidedByUserId: access.userId, approvedPercent, comment: decision.comment ?? null, now });
        const next = this.amountsFor(amounts, approvedPercent, contractMonths);
        offer.approvePending(next, now, { ...details });
        await repos.offers.saveStatus(offer);
        await repos.offers.saveAmounts(offer);
        await repos.approvals.update(approval);
        await recordOfferChange(repos, offer, QuotationStatus.PendingApproval, actorOf(access));
        await this.auditDecision(repos, tenantId, access, approval, offer, companyName);
        pending.push(
          ...(await this.notify(
            repos,
            tenantId,
            access,
            offer,
            deal,
            props.requestedByUserId,
            companyName,
            'DISCOUNT_APPROVED',
            approvedPercent.toString()
          ))
        );
      } else {
        const comment = decision.comment.trim();
        approval.reject({ decidedByUserId: access.userId, comment, now });
        const next = this.amountsFor(amounts, cap, contractMonths);
        offer.rejectPending(next, now);
        await repos.offers.saveStatus(offer);
        await repos.offers.saveAmounts(offer);
        await repos.approvals.update(approval);
        await recordOfferChange(repos, offer, QuotationStatus.PendingApproval, actorOf(access), comment);
        await this.auditDecision(repos, tenantId, access, approval, offer, companyName);
        pending.push(
          ...(await this.notify(
            repos,
            tenantId,
            access,
            offer,
            deal,
            props.requestedByUserId,
            companyName,
            'DISCOUNT_REJECTED',
            cap.toString()
          ))
        );
      }

      // FR-DEAL-10, 11: the board and the list read the deal's value from the deal.
      const nextAmounts = offer.amounts!;
      await repos.deals.setOfferValue(tenantId, deal.id, {
        netMonthlyPrice: nextAmounts.netMonthlyPrice.toString(),
        annualValue: nextAmounts.annualValue.toString(),
      });
    });

    await this.emailDispatcher.dispatch(pending);
    const [view] = await withActions([(await this.store.find(tenantId, offerId))!], access, this.scopes);
    return view;
  }

  /** The offer's amounts with `percent` applied to its list price (FR-DSC-06, 07). */
  private amountsFor(amounts: OfferAmounts, percent: Percent, contractMonths: number): OfferAmounts {
    const discount = PriceCalculator.applyDiscount(amounts.listPrice, percent);
    return {
      ...amounts,
      discountPercent: percent,
      discountAmount: discount.discountAmount,
      netMonthlyPrice: discount.netMonthlyPrice,
      annualValue: discount.netMonthlyPrice.multiplyBy(contractMonths),
    };
  }

  private async ensureInScope(access: AccessContext, ownerId: string | null): Promise<void> {
    access.ensure(APPROVE_DISCOUNTS);
    if (!admits(await this.scopes.resolve(access, APPROVE_DISCOUNTS), ownerId)) {
      throw new PermissionDeniedError(APPROVE_DISCOUNTS);
    }
  }

  private async auditDecision(
    repos: OfferWriteRepos,
    tenantId: string,
    access: AccessContext,
    approval: DiscountApprovalEntity,
    offer: Offer,
    companyName: string
  ): Promise<void> {
    const props = approval.toProps();
    await repos.auditTrail.record({
      tenantId,
      userId: access.userId,
      userRole: access.auditRole,
      action: AuditAction.StatusChange,
      entityType: 'DiscountApproval',
      entityId: props.id,
      entityLabel: await offerAuditLabel(repos, offer),
      changes: [
        { field: 'status', old: 'PENDING', new: props.status },
        { field: 'requestedPercent', old: null, new: props.requestedPercent.toString() },
        { field: 'approvedPercent', old: null, new: props.approvedPercent?.toString() ?? null },
        { field: 'listPriceAtRequest', old: null, new: props.listPriceAtRequest.toString() },
        { field: 'comment', old: null, new: props.comment },
        { field: 'company', old: null, new: companyName },
      ],
    });
  }

  private async notify(
    repos: OfferWriteRepos,
    tenantId: string,
    access: AccessContext,
    offer: Offer,
    deal: Deal,
    requestedByUserId: string,
    companyName: string,
    type: 'DISCOUNT_APPROVED' | 'DISCOUNT_REJECTED',
    percent: string
  ): Promise<Notification[]> {
    const notifications = new NotificationService(repos.notifications, this.users, undefined, this.permissionDirectory);
    return notifications.emit({
      tenantId,
      recipientUserIds: [requestedByUserId],
      type,
      params: {
        reference: quotationReference(offer.toProps()),
        clientName: companyName,
        approvedPercent: percent,
        offerId: offer.id,
        dealId: deal.id,
      },
      actorUserId: access.userId,
      entityType: 'OFFER',
      entityId: deal.id,
    });
  }
}
