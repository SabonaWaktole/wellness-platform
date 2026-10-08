import { randomUUID } from 'crypto';
import type { AccessContext } from '../../../access/domain/AccessContext';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { dayKeyInZone } from '../../../shared/domain/time/tenantDay';
import {
  InvalidPaymentError,
  optionalPaymentText,
  PAYMENT_LIMITS,
  paymentMethod,
  receivedOnDate,
  voidReason,
  type PaymentMethod,
} from '../../domain/memberPayment';
import type { PaymentQuote } from '../../domain/paymentQuote';
import { TIERS, type Tier } from '../../domain/Tier';
import type { PaymentKind } from '../../domain/termDates';
import { effectiveTierAt, PaymentRefusedError, quoteFor, dayText } from '../memberPaymentQuote';
import { MEMBERS_PAYMENTS_RECORD, MEMBERS_PAYMENTS_VIEW } from '../membershipPermissions';
import type { IMemberPaymentStore, MemberPaymentRecord, PaymentFilters } from '../ports/IMemberPaymentStore';
import type { IMemberStore, MemberRecord } from '../ports/IMemberStore';
import type { IMembershipSettingsStore, IRelationshipStore } from '../ports/IMembershipSettingsStore';
import type { IMembershipWriteTransaction } from '../ports/IMembershipWriteTransaction';
import {
  paymentUserIds,
  presentMemberPayment,
  presentQuote,
  type MemberPaymentView,
  type PaymentQuoteView,
} from '../presentMemberPayment';
import { buildReceiptDocument, type IReceiptPdfRenderer, type ReceiptLanguage } from '../receiptDocument';
import { MemberNotFoundError } from './MemberUseCases';

export class PaymentNotFoundError extends Error {
  readonly code = 'PAYMENT_NOT_FOUND';
  constructor() {
    super('Payment not found.');
  }
}

/** FR-MPAY-06: only the member's latest payment can be voided. Mapped to 409. */
export class PaymentNotLatestError extends Error {
  readonly code = 'PAYMENT_NOT_LATEST';
  constructor() {
    super('Only the latest payment of a member can be voided. Void the later payment first.');
  }
}

export class PaymentAlreadyVoidedError extends Error {
  readonly code = 'PAYMENT_ALREADY_VOIDED';
  constructor() {
    super('This payment is already voided.');
  }
}

const KINDS: readonly PaymentKind[] = ['NEW', 'RENEWAL', 'UPGRADE'];
const PURCHASABLE: readonly Tier[] = ['SILVER', 'GOLD'];

const kindOf = (value: unknown): PaymentKind => {
  if (!KINDS.includes(value as PaymentKind)) throw new InvalidPaymentError('kind', 'The kind is New, Renewal or Upgrade.');
  return value as PaymentKind;
};
const tierOf = (value: unknown): Tier => {
  if (!TIERS.includes(value as Tier)) throw new InvalidPaymentError('targetTier', 'The target tier is Silver or Gold.');
  return value as Tier;
};

const label = (member: { memberNumber: string; firstName: string; lastName: string }) => `${member.memberNumber} ${member.firstName} ${member.lastName}`;

/**
 * FR-MPAY-01..04: what a payment would cost and how long it would run. The
 * amount is always calculated here by the domain price rule (FR-MPAY-02); the
 * screen shows it and has no amount field.
 */
export class QuotePaymentUseCase {
  constructor(
    private readonly memberStore: IMemberStore,
    private readonly paymentStore: IMemberPaymentStore,
    private readonly settingsStore: IMembershipSettingsStore,
    private readonly relationshipStore: IRelationshipStore,
    private readonly now: () => Date = () => new Date()
  ) {}

  private get deps() {
    return { paymentStore: this.paymentStore, settingsStore: this.settingsStore, memberStore: this.memberStore, relationshipStore: this.relationshipStore };
  }

  private async load(input: { tenantId: string; memberId: string }) {
    const member = await this.memberStore.find(input.tenantId, input.memberId);
    if (!member) throw new MemberNotFoundError();
    return { member, terms: await this.paymentStore.listTerms(member.id) };
  }

  async execute(input: {
    access: AccessContext;
    tenantId: string;
    timezone: string;
    memberId: string;
    kind: unknown;
    targetTier: unknown;
    receivedOn?: unknown;
  }): Promise<PaymentQuoteView> {
    input.access.ensure(MEMBERS_PAYMENTS_RECORD);
    const today = dayKeyInZone(this.now(), input.timezone);
    const receivedOn = receivedOnDate(input.receivedOn ?? today, today);
    const { member, terms } = await this.load(input);
    const result = await quoteFor(this.deps, input.tenantId, member, terms, { kind: kindOf(input.kind), targetTier: tierOf(input.targetTier), receivedOn });
    if (!result.allowed) throw new PaymentRefusedError(result.reason);
    return presentQuote(result.quote, result.family);
  }

  /** Every payment the member can make on the date, with its quote, so the screen offers nothing refused (FR-MPAY-03). */
  async options(input: {
    access: AccessContext;
    tenantId: string;
    timezone: string;
    memberId: string;
    receivedOn?: unknown;
  }): Promise<{ options: Array<{ kind: PaymentKind; targetTier: Tier; quote: PaymentQuoteView }> }> {
    input.access.ensure(MEMBERS_PAYMENTS_RECORD);
    const today = dayKeyInZone(this.now(), input.timezone);
    const receivedOn = receivedOnDate(input.receivedOn ?? today, today);
    const { member, terms } = await this.load(input);
    const options: Array<{ kind: PaymentKind; targetTier: Tier; quote: PaymentQuoteView }> = [];
    for (const kind of KINDS) {
      for (const targetTier of PURCHASABLE) {
        const result = await quoteFor(this.deps, input.tenantId, member, terms, { kind, targetTier, receivedOn });
        if (result.allowed) options.push({ kind, targetTier, quote: presentQuote(result.quote, result.family) });
      }
    }
    return { options };
  }
}

/**
 * FR-MPAY-01..05, FR-TIR-03, FR-TIR-04, FR-TIR-08, FR-AUD-14. Re-runs the quote
 * inside the transaction, so the number on the screen and the stored one cannot
 * differ, and nothing in the request can set the amount. The payment, the paid
 * term (closing the earlier one for an upgrade), the tier history, the
 * refreshed stored tier and the audit entry are one transaction. The member's
 * row is locked first, so a payment and a void of the same member run one after
 * the other. A sponsored term is left alone (FR-MPAY-04) and a payment never
 * creates a sponsored one (FR-MPAY-09).
 */
export class RecordMemberPaymentUseCase {
  constructor(
    private readonly writeTx: IMembershipWriteTransaction,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: {
    access: AccessContext;
    tenantId: string;
    timezone: string;
    memberId: string;
    body: Record<string, unknown>;
  }): Promise<MemberPaymentRecord> {
    input.access.ensure(MEMBERS_PAYMENTS_RECORD);
    const today = dayKeyInZone(this.now(), input.timezone);
    const kind = kindOf(input.body.kind);
    const targetTier = tierOf(input.body.targetTier);
    const method: PaymentMethod = paymentMethod(input.body.method);
    const receivedOn = receivedOnDate(input.body.receivedOn, today);
    const note = optionalPaymentText(input.body.note, 'note', PAYMENT_LIMITS.note);

    return this.writeTx.run(async ({ memberStore, paymentStore, settingsStore, relationshipStore, receiptNumbers, auditTrail }) => {
      if (!(await paymentStore.lockMember(input.tenantId, input.memberId))) throw new MemberNotFoundError();
      const member = (await memberStore.find(input.tenantId, input.memberId)) as MemberRecord;
      const deps = { paymentStore, settingsStore, memberStore, relationshipStore };
      const termsBefore = await paymentStore.listTerms(member.id);

      const result = await quoteFor(deps, input.tenantId, member, termsBefore, { kind, targetTier, receivedOn });
      if (!result.allowed) throw new PaymentRefusedError(result.reason);
      const quote: PaymentQuote = result.quote;
      const tierBefore = await effectiveTierAt(deps, input.tenantId, member, termsBefore, today);

      const payment = await paymentStore.create({
        id: randomUUID(),
        tenantId: input.tenantId,
        memberId: member.id,
        kind: quote.kind,
        fromTier: quote.fromTier,
        toTier: quote.toTier,
        listFee: quote.listFee.toString(),
        discountPercent: quote.discountPercent.toString(),
        amount: quote.amount.toString(),
        method,
        receivedOn,
        receiptNumber: await receiptNumbers.next(input.tenantId, Number(today.slice(0, 4))),
        note,
        recordedBy: input.access.userId,
      });

      for (const closed of quote.closes) {
        await paymentStore.closeTermEarly(closed.termId, dayText(closed.newEndsOn), payment.id, dayText(closed.originalEndsOn));
      }
      await paymentStore.insertTerm({
        id: randomUUID(),
        memberId: member.id,
        tier: quote.toTier,
        source: 'PAID',
        startsOn: dayText(quote.startsOn),
        endsOn: dayText(quote.endsOn),
        paymentId: payment.id,
      });

      const tierAfter = await effectiveTierAt(deps, input.tenantId, member, await paymentStore.listTerms(member.id), today);
      await paymentStore.setCurrentTier(input.tenantId, member.id, tierAfter);
      // A renewal keeps the tier, so it has no row (FR-TIR-08); a purchase on the same tier has none either.
      if (tierAfter !== tierBefore) {
        await paymentStore.addTierHistory({
          memberId: member.id,
          fromTier: tierBefore,
          toTier: tierAfter,
          reason: quote.kind === 'UPGRADE' ? 'Upgrade' : 'Purchase',
          comment: payment.receiptNumber,
          changedByUserId: input.access.userId,
        });
      }

      await auditTrail.record({
        tenantId: input.tenantId,
        userId: input.access.userId,
        userRole: input.access.auditRole,
        action: AuditAction.Create,
        entityType: 'MemberPayment',
        entityId: payment.id,
        entityLabel: `${payment.receiptNumber} ${label(member)}`,
        changes: [
          { field: 'receiptNumber', old: null, new: payment.receiptNumber },
          { field: 'member', old: null, new: member.memberNumber },
          { field: 'kind', old: null, new: payment.kind },
          { field: 'fromTier', old: null, new: payment.fromTier },
          { field: 'toTier', old: null, new: payment.toTier },
          { field: 'listFee', old: null, new: payment.listFee },
          { field: 'discountPercent', old: null, new: payment.discountPercent },
          { field: 'amount', old: null, new: payment.amount },
          { field: 'method', old: null, new: payment.method },
          { field: 'receivedOn', old: null, new: payment.receivedOn },
          { field: 'termStartsOn', old: null, new: dayText(quote.startsOn) },
          { field: 'termEndsOn', old: null, new: dayText(quote.endsOn) },
        ],
      });
      return payment;
    });
  }
}

/**
 * FR-MPAY-06: voids the member's latest payment, with a reason. The term the
 * payment created is removed, the term it closed gets its end date back, the
 * receipt number stays and is marked Voided, and the change of tier is written
 * to the history as a Correction. An earlier payment cannot be voided while a
 * later one exists.
 */
export class VoidMemberPaymentUseCase {
  constructor(
    private readonly writeTx: IMembershipWriteTransaction,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; timezone: string; paymentId: string; reason: unknown }): Promise<MemberPaymentRecord> {
    input.access.ensure(MEMBERS_PAYMENTS_RECORD);
    const reason = voidReason(input.reason);
    const today = dayKeyInZone(this.now(), input.timezone);

    return this.writeTx.run(async ({ memberStore, paymentStore, settingsStore, relationshipStore, auditTrail }) => {
      const found = await paymentStore.find(input.tenantId, input.paymentId);
      if (!found) throw new PaymentNotFoundError();
      await paymentStore.lockMember(input.tenantId, found.memberId);
      // Read again after the lock: a payment recorded a moment ago is now the latest.
      const payment = (await paymentStore.find(input.tenantId, input.paymentId)) as MemberPaymentRecord;
      if (payment.voidedAt) throw new PaymentAlreadyVoidedError();
      const latest = await paymentStore.latestActive(input.tenantId, payment.memberId);
      if (latest?.id !== payment.id) throw new PaymentNotLatestError();

      const member = (await memberStore.find(input.tenantId, payment.memberId)) as MemberRecord;
      const deps = { paymentStore, settingsStore, memberStore, relationshipStore };
      const termsBefore = await paymentStore.listTerms(member.id);
      const tierBefore = await effectiveTierAt(deps, input.tenantId, member, termsBefore, today);

      await paymentStore.deleteTermsOfPayment(payment.id);
      for (const closed of termsBefore.filter((t) => t.closedEarlyByPaymentId === payment.id && t.originalEndsOn !== null)) {
        await paymentStore.restoreTerm(closed.id, closed.originalEndsOn!);
      }
      const voidedAt = this.now();
      await paymentStore.markVoided(input.tenantId, payment.id, voidedAt, input.access.userId, reason);

      const tierAfter = await effectiveTierAt(deps, input.tenantId, member, await paymentStore.listTerms(member.id), today);
      await paymentStore.setCurrentTier(input.tenantId, member.id, tierAfter);
      if (tierAfter !== tierBefore) {
        await paymentStore.addTierHistory({
          memberId: member.id,
          fromTier: tierBefore,
          toTier: tierAfter,
          reason: 'Correction',
          comment: `Voided ${payment.receiptNumber}: ${reason}`,
          changedByUserId: input.access.userId,
        });
      }

      await auditTrail.record({
        tenantId: input.tenantId,
        userId: input.access.userId,
        userRole: input.access.auditRole,
        action: AuditAction.StatusChange,
        entityType: 'MemberPayment',
        entityId: payment.id,
        entityLabel: `${payment.receiptNumber} ${label(member)}`,
        changes: [
          { field: 'status', old: 'RECORDED', new: 'VOIDED' },
          { field: 'reason', old: null, new: reason },
        ],
      });
      return { ...payment, voidedAt, voidedBy: input.access.userId, voidReason: reason };
    });
  }
}

export interface SearchPaymentsInput {
  access: AccessContext;
  tenantId: string;
  filters: PaymentFilters;
  page?: number;
  limit?: number;
}

const MAX_LIMIT = 100;
const EXPORT_CHUNK = 500;

/**
 * FR-MPAY-07: the Membership payments list, with the total of the whole
 * filtered list summed in the database as a Decimal, voided payments left out.
 */
export class SearchMemberPaymentsUseCase {
  constructor(
    private readonly paymentStore: IMemberPaymentStore,
    private readonly memberStore: IMemberStore
  ) {}

  async execute(input: SearchPaymentsInput): Promise<{ data: MemberPaymentView[]; total: number; totalAmount: string; page: number; limit: number }> {
    input.access.ensure(MEMBERS_PAYMENTS_VIEW);
    const page = Math.max(1, Math.floor(input.page ?? 1));
    const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(input.limit ?? 25)));
    const result = await this.paymentStore.search(input.tenantId, input.filters, page, limit);
    const names = await this.memberStore.userNames(input.tenantId, paymentUserIds(result.data));
    return { data: result.data.map((p) => presentMemberPayment(p, names)), total: result.total, totalAmount: result.totalAmount, page, limit };
  }

  /** Every row of the filter, for the export (FR-MPAY-10). */
  async all(input: Omit<SearchPaymentsInput, 'page' | 'limit'>): Promise<{ rows: MemberPaymentView[]; totalAmount: string }> {
    input.access.ensure(MEMBERS_PAYMENTS_VIEW);
    const rows: MemberPaymentRecord[] = [];
    let totalAmount = '0.00';
    for (let page = 1; ; page++) {
      const result = await this.paymentStore.search(input.tenantId, input.filters, page, EXPORT_CHUNK);
      rows.push(...result.data);
      totalAmount = result.totalAmount;
      if (rows.length >= result.total || result.data.length === 0) break;
    }
    const names = await this.memberStore.userNames(input.tenantId, paymentUserIds(rows));
    return { rows: rows.map((p) => presentMemberPayment(p, names)), totalAmount };
  }
}

/**
 * FR-MPAY-10, FR-AUD-16: an export of the filtered payments. The audit entry
 * (who, when, the filters used and the row count, never a personal value) is
 * written before the file is handed over: an export that happened is always on
 * record, and one that cannot be recorded does not happen.
 */
export class ExportMemberPaymentsUseCase {
  constructor(
    private readonly search: SearchMemberPaymentsUseCase,
    private readonly writeTx: IMembershipWriteTransaction
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; filters: PaymentFilters }): Promise<{ rows: MemberPaymentView[]; totalAmount: string }> {
    const result = await this.search.all(input);
    const { filters } = input;
    await this.writeTx.run(({ auditTrail }) =>
      auditTrail.record({
        tenantId: input.tenantId,
        userId: input.access.userId,
        userRole: input.access.auditRole,
        action: AuditAction.Export,
        entityType: 'MemberPayment',
        entityId: 'export',
        entityLabel: 'Membership payments export',
        changes: [
          { field: 'format', old: null, new: 'CSV' },
          { field: 'rows', old: null, new: result.rows.length },
          ...Object.entries(filters)
            .filter(([, value]) => value !== undefined && value !== '')
            .map(([key, value]) => ({ field: `filter.${key}`, old: null, new: String(value) })),
        ],
      })
    );
    return result;
  }
}

/**
 * FR-MPAY-11: the printable receipt. Whoever may view payments may open it, for
 * a recorded or a voided payment (the voided one says so). It states that it is
 * not an invoice, in Albanian and English.
 */
export class GetPaymentReceiptUseCase {
  constructor(
    private readonly paymentStore: IMemberPaymentStore,
    private readonly memberStore: IMemberStore,
    private readonly renderer: IReceiptPdfRenderer
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; paymentId: string; language: ReceiptLanguage; issuerName: string }): Promise<{ pdf: Buffer; receiptNumber: string }> {
    input.access.ensure(MEMBERS_PAYMENTS_VIEW);
    const payment = await this.paymentStore.find(input.tenantId, input.paymentId);
    if (!payment) throw new PaymentNotFoundError();
    const [terms, names] = await Promise.all([
      this.paymentStore.listTerms(payment.memberId),
      this.memberStore.userNames(input.tenantId, [payment.recordedBy]),
    ]);
    const document = buildReceiptDocument({ language: input.language, issuerName: input.issuerName, payment, terms, agentName: names[payment.recordedBy] ?? null });
    return { pdf: await this.renderer.render(document), receiptNumber: payment.receiptNumber };
  }
}
