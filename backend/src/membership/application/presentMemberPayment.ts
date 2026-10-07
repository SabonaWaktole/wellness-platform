import type { MemberPaymentRecord } from './ports/IMemberPaymentStore';
import type { PaymentQuote } from '../domain/paymentQuote';
import { dayText } from './memberPaymentQuote';

/**
 * What the payment routes send (FR-MPAY-07, FR-MPAY-08). Money is a string and
 * the frontend only formats it. Every money, receipt and void field is removed
 * by `redactMemberFields` for a user without "Members: view payments".
 */
export interface MemberPaymentView {
  id: string;
  memberId: string;
  memberNumber: string;
  memberName: string;
  kind: MemberPaymentRecord['kind'];
  fromTier: MemberPaymentRecord['fromTier'];
  toTier: MemberPaymentRecord['toTier'];
  listFee: string;
  discountPercent: string;
  amount: string;
  method: MemberPaymentRecord['method'];
  receivedOn: string;
  receiptNumber: string;
  note: string | null;
  recordedBy: { id: string; name: string | null };
  createdAt: Date;
  status: 'RECORDED' | 'VOIDED';
  voidedAt: Date | null;
  voidedBy: { id: string; name: string | null } | null;
  voidReason: string | null;
}

export function presentMemberPayment(payment: MemberPaymentRecord, names: Record<string, string>): MemberPaymentView {
  return {
    id: payment.id,
    memberId: payment.memberId,
    memberNumber: payment.memberNumber,
    memberName: `${payment.memberFirstName} ${payment.memberLastName}`,
    kind: payment.kind,
    fromTier: payment.fromTier,
    toTier: payment.toTier,
    listFee: payment.listFee,
    discountPercent: payment.discountPercent,
    amount: payment.amount,
    method: payment.method,
    receivedOn: payment.receivedOn,
    receiptNumber: payment.receiptNumber,
    note: payment.note,
    recordedBy: { id: payment.recordedBy, name: names[payment.recordedBy] ?? null },
    createdAt: payment.createdAt,
    status: payment.voidedAt ? 'VOIDED' : 'RECORDED',
    voidedAt: payment.voidedAt,
    voidedBy: payment.voidedBy ? { id: payment.voidedBy, name: names[payment.voidedBy] ?? null } : null,
    voidReason: payment.voidReason,
  };
}

export const paymentUserIds = (payments: readonly MemberPaymentRecord[]): string[] =>
  payments.flatMap((p) => [p.recordedBy, ...(p.voidedBy ? [p.voidedBy] : [])]);

/** The quote the screen shows before saving: the amount is calculated, never typed (FR-MPAY-01). */
export interface PaymentQuoteView {
  kind: PaymentQuote['kind'];
  fromTier: PaymentQuote['fromTier'];
  toTier: PaymentQuote['toTier'];
  listFee: string;
  discountPercent: string;
  amount: string;
  startsOn: string;
  endsOn: string;
  closesTerms: Array<{ termId: string; endsOn: string }>;
  warnings: PaymentQuote['warnings'];
}

export const presentQuote = (quote: PaymentQuote): PaymentQuoteView => ({
  kind: quote.kind,
  fromTier: quote.fromTier,
  toTier: quote.toTier,
  listFee: quote.listFee.toString(),
  discountPercent: quote.discountPercent.toString(),
  amount: quote.amount.toString(),
  startsOn: dayText(quote.startsOn),
  endsOn: dayText(quote.endsOn),
  closesTerms: quote.closes.map((c) => ({ termId: c.termId, endsOn: dayText(c.newEndsOn) })),
  warnings: quote.warnings,
});
