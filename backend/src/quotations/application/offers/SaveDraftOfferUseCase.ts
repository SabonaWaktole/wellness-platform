import { randomUUID } from 'crypto';
import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { admits } from '../../../access/domain/RecordScope';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { IUserRepository } from '../../../auth/domain/repositories/IUserRepository';
import { DealStage } from '../../../deals/domain/DealStage';
import { DiscountApproval } from '../../../discounts/domain/DiscountApproval';
import { DiscountPolicy } from '../../../discounts/domain/DiscountPolicy';
import { Money } from '../../../pricing/domain/Money';
import { parseFee } from '../../../pricing/domain/PricingValues';
import { Notification } from '../../../notifications/domain/Notification';
import { NotificationService } from '../../../notifications/application/NotificationService';
import { IPermissionHolderDirectory } from '../../../notifications/application/ports/IPermissionHolderDirectory';
import { PricingChoices, PricingScreen } from '../../../pricing/application/PricingScreen';
import { IPricingSubjectReader } from '../../../pricing/application/ports/IPricingSubjectReader';
import { EDIT_OFFERS } from '../../../pricing/application/use-cases/ListActivePackagesUseCase';
import { pricingSubjectInScope } from '../../../pricing/application/use-cases/CalculatePriceUseCase';
import { PricingSubjectNotFoundError } from '../../../pricing/domain/errors';
import { InvalidPricingInputError } from '../../../pricing/domain/errors';
import { Offer, OfferContent, OfferManualPrice } from '../../domain/Offer';
import { OfferNotEditableError, OfferReviseFirstError } from '../../domain/offerErrors';
import { quotationReference } from '../../domain/quotationReference';
import { QuotationStatus } from '../../domain/Quotation';
import { APPROVE_DISCOUNTS, withActions } from './offerAccess';
import { actorOf, offerAuditLabel, recordOfferChange } from './offerChanges';
import { offerContentFrom } from './offerContent';
import { OfferView } from './offerViews';
import { IOfferStore } from './ports/IOfferStore';
import { IOfferWriteTransaction, OfferWriteRepos } from './ports/IOfferWriteTransaction';
import { approvalRequestParams, displayName } from './approvalNotices';

/** A discount up to the cap (FR-DSC-02). Scoped, on the deal's salesperson. */
export const APPLY_DISCOUNTS = 'discounts.apply';

/** Changing the company record, here its employee count (FR-PRC-04). Scoped. */
export const EDIT_COMPANIES = 'companies.edit';

export interface SaveDraftOfferInput {
  access: AccessContext;
  tenantId: string;
  dealId: string;
  choices: PricingChoices;
  note: string | null;
  /** FR-PRC-04: also write the employees priced to the company record. */
  alsoUpdateCompany: boolean;
  /**
   * FR-OFR-02: the contact the offer is addressed to; null for the
   * company's primary contact, undefined to keep the offer's.
   */
  contactPersonId?: string | null;
  /**
   * FR-DSC-03, FR-PRC-09: why the discount is above the cap, or why the
   * price is set by hand. Required when a request is made; ignored when an
   * earlier approval still covers the save (FR-DSC-08).
   */
  reason?: string | null;
  /** FR-PRC-09: a manual monthly price on a "Price on request" offer. */
  manualMonthlyPrice?: unknown;
}

/**
 * Saving the pricing screen (FR-PRC-12, FR-OFR-01): updates the deal's
 * latest offer while it is a draft or Ready (a Ready one becomes a draft
 * again), or creates a new numbered offer (FR-OFR-08) when the deal has none
 * or its latest was answered or expired. A sent offer is changed only by
 * revising it (FR-OFR-11). The calculation is made again on the server
 * (FR-OFR-03). In one transaction it also sets the deal's value, moves the
 * deal to Offer Prepared on its first offer (FR-DEAL-08) and, when asked,
 * updates the company's employee count with an audit entry (FR-PRC-04).
 */
export class SaveDraftOfferUseCase {
  constructor(
    private readonly subjects: IPricingSubjectReader,
    private readonly screen: PricingScreen,
    private readonly scopes: RecordScopeResolver,
    private readonly writeTx: IOfferWriteTransaction,
    private readonly store: IOfferStore,
    private readonly users: IUserRepository,
    private readonly permissionDirectory: IPermissionHolderDirectory,
    private readonly emailDispatcher: { dispatch(notifications: Notification[]): Promise<void> },
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: SaveDraftOfferInput): Promise<{ offer: OfferView; created: boolean }> {
    const { access, tenantId } = input;
    access.ensure(EDIT_OFFERS);
    const subject = await pricingSubjectInScope(this.subjects, this.scopes, access, tenantId, { dealId: input.dealId });
    const deal = subject.deal!;
    if (!deal.open) {
      throw new OfferNotEditableError('A closed deal takes no new offer.');
    }

    const state = await this.screen.resolve(tenantId, subject, input.choices);
    if (!state.discountPercent.isZero()) await this.ensureInScope(access, APPLY_DISCOUNTS, deal.ownerUserId);
    const reason = input.reason?.trim() ?? '';
    // FR-PRC-09: a manual price on "Price on request", always with a reason.
    const manualPrice: OfferManualPrice | null =
      input.manualMonthlyPrice === undefined || input.manualMonthlyPrice === null || input.manualMonthlyPrice === ''
        ? null
        : { monthlyPrice: Money.of(parseFee(input.manualMonthlyPrice, 'manualMonthlyPrice')), reason };
    if (manualPrice?.monthlyPrice.isZero()) {
      throw new InvalidPricingInputError('manualMonthlyPrice', 'A manual price must be more than 0.');
    }
    const content = offerContentFrom(state, input.note, input.contactPersonId ?? null, {
      allowAboveCap: state.discountAboveCap,
      manualPrice,
    });
    // FR-DSC-03, 04: above the cap the save becomes a request with a reason,
    // not a refusal. Without a price there is nothing to approve.
    const aboveCap = state.discountAboveCap;
    if (aboveCap && !content.amounts) {
      throw new InvalidPricingInputError('discountPercent', 'An offer without a price cannot request approval.');
    }
    // FR-PRC-09: whoever may approve discounts for this deal sets a manual price directly.
    const setsPriceDirectly =
      manualPrice !== null &&
      access.can(APPROVE_DISCOUNTS) &&
      admits(await this.scopes.resolve(access, APPROVE_DISCOUNTS), deal.ownerUserId);
    const employees = content.employeesPriced;
    const updateCompany = input.alsoUpdateCompany && employees !== subject.employeeCount;
    if (updateCompany) await this.ensureInScope(access, EDIT_COMPANIES, subject.companyAssigneeId);

    const now = this.now();
    const pending: Notification[] = [];
    const { offerId, created } = await this.writeTx.run(async (repos) => {
      const { offers, deals, auditTrail } = repos;
      const live = await deals.find(tenantId, deal.id);
      if (!live) throw new PricingSubjectNotFoundError();
      if (!live.isOpen) throw new OfferNotEditableError('A closed deal takes no new offer.');

      if (input.contactPersonId && !(await offers.isContactOf(tenantId, subject.clientId, input.contactPersonId))) {
        throw new InvalidPricingInputError('contactPersonId', 'Choose a contact person of this company.');
      }

      const first = (await offers.countForDeal(tenantId, deal.id)) === 0;
      const latest = await offers.latest(tenantId, deal.id);
      const editable = latest && (latest.status === QuotationStatus.Draft || latest.status === QuotationStatus.Ready) ? latest : null;
      if (!editable && latest?.status === QuotationStatus.Sent) throw new OfferReviseFirstError();
      if (!editable && latest?.status === QuotationStatus.PendingApproval) {
        throw new OfferNotEditableError('This offer is waiting for approval.');
      }

      // FR-DSC-08, FR-PRC-09: an earlier approval of this offer still covers
      // the save while the list price is the same and the discount is not
      // raised above it (or the manual price is the one approved). Lowering
      // the discount keeps the approval; anything else asks again.
      const decided = editable ? await repos.approvals.forOffer(tenantId, editable.id) : [];
      const amounts = content.amounts;
      const cap = state.config.discountCap;
      const discountCovered =
        aboveCap &&
        DiscountPolicy.evaluate(
          amounts!.discountPercent,
          cap,
          decided.map((approval) => approval.approvedDiscount).find((approved) => approved !== null) ?? null,
          amounts!.listPrice
        ) === 'APPROVED_COVERS';
      const priceCovered =
        manualPrice !== null &&
        (decided.find((approval) => approval.kind === 'MANUAL_PRICE' && approval.status === 'APPROVED')?.coversManualPrice(
          manualPrice.monthlyPrice
        ) ??
          false);
      const needsRequest = (aboveCap && !discountCovered) || (manualPrice !== null && !priceCovered && !setsPriceDirectly);
      if (!reason && manualPrice !== null && !priceCovered) {
        throw new InvalidPricingInputError('reason', 'A reason is required for a manual price.');
      }
      if (!reason && needsRequest) {
        throw new InvalidPricingInputError('reason', 'A reason is required for a discount above the cap.');
      }
      // A covered manual price saved again without a reason keeps the one it was approved with.
      const saved: OfferContent =
        manualPrice && !reason
          ? { ...content, manualPrice: { ...manualPrice, reason: editable?.manualPrice?.reason ?? '' } }
          : content;

      let offer: Offer;
      let isNew = false;
      // The status the offer had before this save, for the history row. New
      // offers record NONE → PENDING_APPROVAL on insert, so they need no row here.
      let previous: QuotationStatus | null = null;
      if (editable) {
        offer = editable;
        const keepContact = input.contactPersonId === undefined ? offer.toProps().contactPersonId : content.contactPersonId;
        previous = offer.replaceDraft({ ...saved, contactPersonId: keepContact }, now);
        if (needsRequest) offer.requestApproval(now);
        await offers.update(offer);
      } else {
        isNew = true;
        offer = Offer.draft({
          id: randomUUID(),
          tenantId,
          clientId: subject.clientId,
          dealId: deal.id,
          createdByUserId: access.userId,
          number: await repos.numbers.next(tenantId, now),
          language: await offers.workspaceLanguage(tenantId),
          content: saved,
          now,
        });
        if (needsRequest) offer.requestApproval(now);
        await offers.insert(offer);
      }

      if (needsRequest) {
        // A new request supersedes the offer's earlier pending ones, so the
        // approver's list holds one row per offer (FR-DSC-03).
        for (const earlier of await repos.approvals.pendingForOffer(tenantId, offer.id)) {
          earlier.supersede();
          await repos.approvals.update(earlier);
        }
        const base = { id: randomUUID(), tenantId, quotationId: offer.id, requestedByUserId: access.userId, reason, now };
        const approval =
          aboveCap && !discountCovered
            ? DiscountApproval.request({ ...base, requestedPercent: amounts!.discountPercent, listPriceAtRequest: amounts!.listPrice })
            : DiscountApproval.requestManualPrice({ ...base, requestedMonthlyPrice: manualPrice!.monthlyPrice });
        await repos.approvals.insert(approval);
        if (previous !== null) await recordOfferChange(repos, offer, previous, actorOf(access));
        await this.auditRequest(repos, access, offer, approval);
        const props = approval.toProps();
        const notifications = new NotificationService(repos.notifications, this.users, undefined, this.permissionDirectory);
        pending.push(
          ...(await notifications.emit({
            tenantId,
            toPermission: { key: APPROVE_DISCOUNTS, subjectOwnerId: deal.ownerUserId },
            type: 'DISCOUNT_APPROVAL_REQUESTED',
            params: approvalRequestParams({
              kind: props.kind,
              reference: quotationReference(offer.toProps()),
              clientName: subject.companyName,
              salespersonName: displayName(await this.users.findById(access.userId)),
              reason,
              requestedPercent: props.requestedPercent?.toString() ?? null,
              listPrice: props.listPriceAtRequest?.toString() ?? null,
              requestedMonthlyPrice: props.requestedMonthlyPrice?.toString() ?? null,
              offerId: offer.id,
              dealId: deal.id,
            }),
            actorUserId: access.userId,
            entityType: 'OFFER',
            entityId: deal.id,
          }))
        );
      } else {
        if (manualPrice && !priceCovered) {
          // FR-PRC-09: set directly by an approver, recorded and audited.
          const approval = DiscountApproval.setManualPrice({
            id: randomUUID(),
            tenantId,
            quotationId: offer.id,
            requestedByUserId: access.userId,
            monthlyPrice: manualPrice.monthlyPrice,
            reason,
            now,
          });
          await repos.approvals.insert(approval);
          await this.auditRequest(repos, access, offer, approval);
        }
        if (previous !== null && previous !== QuotationStatus.Draft) {
          // A Ready offer goes back to draft: that is a status change (FR-OFR-15).
          await recordOfferChange(repos, offer, previous, actorOf(access));
        }
      }

      if (updateCompany) {
        const company = await offers.setCompanyEmployees(tenantId, subject.clientId, employees, access.userId);
        if (company) {
          await auditTrail.record({
            tenantId,
            userId: access.userId,
            userRole: access.auditRole,
            action: AuditAction.Update,
            entityType: 'Client',
            entityId: subject.clientId,
            entityLabel: company.companyName,
            changes: [{ field: 'employeeCount', old: company.previous, new: employees }],
          });
        }
      }

      // FR-DEAL-10, 11: the board and the list read the deal's value from the deal.
      const value = offer.amounts;
      await deals.setOfferValue(tenantId, deal.id, {
        netMonthlyPrice: value?.netMonthlyPrice.toString() ?? null,
        annualValue: value?.annualValue.toString() ?? null,
      });

      // FR-DEAL-08: the first offer moves the deal to Offer Prepared, never backwards.
      if (first) {
        const change = live.advanceAutomatically(DealStage.OfferPrepared, now, randomUUID);
        if (change) {
          await deals.update(live);
          await deals.recordChange(tenantId, change);
        }
      }
      return { offerId: offer.id, created: isNew };
    });

    // Post-commit email, never inside the transaction: the offer stands
    // whether or not the mail lands.
    await this.emailDispatcher.dispatch(pending);

    const [offer] = await withActions([(await this.store.find(tenantId, offerId))!], access, this.scopes);
    return { offer, created };
  }

  /** FR-DSC-11, FR-PRC-09: one `DiscountApproval` entry per request, or per manual price set directly. */
  private async auditRequest(repos: OfferWriteRepos, access: AccessContext, offer: Offer, approval: DiscountApproval): Promise<void> {
    const props = approval.toProps();
    const changes = [
      { field: 'kind', old: null, new: props.kind },
      { field: 'status', old: null, new: props.status },
      ...(props.kind === 'DISCOUNT'
        ? [
            { field: 'requestedPercent', old: null, new: props.requestedPercent!.toString() },
            { field: 'listPriceAtRequest', old: null, new: props.listPriceAtRequest!.toString() },
          ]
        : [{ field: 'requestedMonthlyPrice', old: null, new: props.requestedMonthlyPrice!.toString() }]),
      { field: 'reason', old: null, new: props.reason },
    ];
    await repos.auditTrail.record({
      tenantId: props.tenantId,
      userId: access.userId,
      userRole: access.auditRole,
      action: AuditAction.Create,
      entityType: 'DiscountApproval',
      entityId: props.id,
      entityLabel: await offerAuditLabel(repos, offer),
      changes,
    });
  }

  private async ensureInScope(access: AccessContext, key: string, ownerId: string | null): Promise<void> {
    access.ensure(key);
    if (!admits(await this.scopes.resolve(access, key), ownerId)) {
      throw new PermissionDeniedError(key);
    }
  }
}
