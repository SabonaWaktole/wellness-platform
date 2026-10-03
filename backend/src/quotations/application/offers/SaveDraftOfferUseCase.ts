import { randomUUID } from 'crypto';
import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { admits } from '../../../access/domain/RecordScope';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { IUserRepository } from '../../../auth/domain/repositories/IUserRepository';
import { DealStage } from '../../../deals/domain/DealStage';
import { DiscountApproval } from '../../../discounts/domain/DiscountApproval';
import { Notification } from '../../../notifications/domain/Notification';
import { NotificationService } from '../../../notifications/application/NotificationService';
import { IPermissionHolderDirectory } from '../../../notifications/application/ports/IPermissionHolderDirectory';
import { PricingChoices, PricingScreen } from '../../../pricing/application/PricingScreen';
import { IPricingSubjectReader } from '../../../pricing/application/ports/IPricingSubjectReader';
import { EDIT_OFFERS } from '../../../pricing/application/use-cases/ListActivePackagesUseCase';
import { pricingSubjectInScope } from '../../../pricing/application/use-cases/CalculatePriceUseCase';
import { PricingSubjectNotFoundError } from '../../../pricing/domain/errors';
import { InvalidPricingInputError } from '../../../pricing/domain/errors';
import { Offer } from '../../domain/Offer';
import { OfferNotEditableError, OfferReviseFirstError } from '../../domain/offerErrors';
import { quotationReference } from '../../domain/quotationReference';
import { QuotationStatus } from '../../domain/Quotation';
import { APPROVE_DISCOUNTS, withActions } from './offerAccess';
import { actorOf, offerAuditLabel, recordOfferChange } from './offerChanges';
import { offerContentFrom } from './offerContent';
import { OfferView } from './offerViews';
import { IOfferStore } from './ports/IOfferStore';
import { IOfferWriteTransaction } from './ports/IOfferWriteTransaction';

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
   * FR-DSC-03: why the discount is above the cap. Required when it is;
   * ignored otherwise.
   */
  reason?: string | null;
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
    const content = offerContentFrom(state, input.note, input.contactPersonId ?? null, {
      allowAboveCap: state.discountAboveCap,
    });
    // FR-DSC-03, 04: above the cap the save becomes a request with a reason,
    // not a refusal. Without a price there is nothing to approve.
    const aboveCap = state.discountAboveCap;
    const reason = input.reason?.trim() ?? '';
    if (aboveCap) {
      if (!content.amounts) {
        throw new InvalidPricingInputError('discountPercent', 'An offer without a price cannot request approval.');
      }
      if (!reason) {
        throw new InvalidPricingInputError('reason', 'A reason is required for a discount above the cap.');
      }
    }
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
      let offer: Offer;
      let isNew = false;
      // The status the offer had before this save, for the history row. New
      // offers record NONE → PENDING_APPROVAL on insert, so they need no row here.
      let previous: QuotationStatus | null = null;
      if (latest && (latest.status === QuotationStatus.Draft || latest.status === QuotationStatus.Ready)) {
        offer = latest;
        const keepContact = input.contactPersonId === undefined ? offer.toProps().contactPersonId : content.contactPersonId;
        previous = offer.replaceDraft({ ...content, contactPersonId: keepContact }, now);
        if (aboveCap) offer.requestApproval(now);
        await offers.update(offer);
      } else if (latest?.status === QuotationStatus.Sent) {
        throw new OfferReviseFirstError();
      } else if (latest?.status === QuotationStatus.PendingApproval) {
        throw new OfferNotEditableError('This offer is waiting for approval.');
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
          content,
          now,
        });
        if (aboveCap) offer.requestApproval(now);
        await offers.insert(offer);
      }

      if (aboveCap) {
        // A new request supersedes the offer's earlier pending ones, so the
        // approver's list holds one row per offer (FR-DSC-03).
        for (const earlier of await repos.approvals.pendingForOffer(tenantId, offer.id)) {
          earlier.supersede();
          await repos.approvals.update(earlier);
        }
        const amounts = offer.amounts!;
        const approval = DiscountApproval.request({
          id: randomUUID(),
          tenantId,
          quotationId: offer.id,
          requestedByUserId: access.userId,
          requestedPercent: amounts.discountPercent,
          listPriceAtRequest: amounts.listPrice,
          reason,
          now,
        });
        await repos.approvals.insert(approval);
        if (previous !== null) await recordOfferChange(repos, offer, previous, actorOf(access));
        await auditTrail.record({
          tenantId,
          userId: access.userId,
          userRole: access.auditRole,
          action: AuditAction.Create,
          entityType: 'DiscountApproval',
          entityId: approval.id,
          entityLabel: await offerAuditLabel(repos, offer),
          changes: [
            { field: 'requestedPercent', old: null, new: amounts.discountPercent.toString() },
            { field: 'listPriceAtRequest', old: null, new: amounts.listPrice.toString() },
            { field: 'reason', old: null, new: reason },
          ],
        });
        const notifications = new NotificationService(repos.notifications, this.users, undefined, this.permissionDirectory);
        pending.push(
          ...(await notifications.emit({
            tenantId,
            toPermission: { key: APPROVE_DISCOUNTS, subjectOwnerId: deal.ownerUserId },
            type: 'DISCOUNT_APPROVAL_REQUESTED',
            params: {
              reference: quotationReference(offer.toProps()),
              clientName: subject.companyName,
              requestedPercent: amounts.discountPercent.toString(),
              offerId: offer.id,
              dealId: deal.id,
            },
            actorUserId: access.userId,
            entityType: 'OFFER',
            entityId: deal.id,
          }))
        );
      } else if (previous !== null && previous !== QuotationStatus.Draft) {
        // A Ready offer goes back to draft: that is a status change (FR-OFR-15).
        await recordOfferChange(repos, offer, previous, actorOf(access));
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
      const amounts = offer.amounts;
      await deals.setOfferValue(tenantId, deal.id, {
        netMonthlyPrice: amounts?.netMonthlyPrice.toString() ?? null,
        annualValue: amounts?.annualValue.toString() ?? null,
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

  private async ensureInScope(access: AccessContext, key: string, ownerId: string | null): Promise<void> {
    access.ensure(key);
    if (!admits(await this.scopes.resolve(access, key), ownerId)) {
      throw new PermissionDeniedError(key);
    }
  }
}
