import type { MemberPaymentRecord, PaymentTermRecord } from './ports/IMemberPaymentStore';

export type ReceiptLanguage = 'sq' | 'en';

/**
 * Everything the receipt PDF prints, as plain values (FR-MPAY-11). The renderer
 * draws this and reads nothing else, so the PDF always shows what the payment
 * holds. Money is the stored two-decimal string.
 */
export interface ReceiptDocument {
  language: ReceiptLanguage;
  issuerName: string;
  receiptNumber: string;
  memberName: string;
  memberNumber: string;
  tier: MemberPaymentRecord['toTier'];
  kind: MemberPaymentRecord['kind'];
  /** The term the payment bought. Null once the payment is voided and the term removed. */
  period: { startsOn: string; endsOn: string } | null;
  listFee: string;
  discountPercent: string;
  amount: string;
  method: MemberPaymentRecord['method'];
  receivedOn: string;
  agentName: string | null;
  voided: { reason: string; on: string } | null;
}

export function buildReceiptDocument(input: {
  language: ReceiptLanguage;
  issuerName: string;
  payment: MemberPaymentRecord;
  terms: readonly PaymentTermRecord[];
  agentName: string | null;
}): ReceiptDocument {
  const { payment } = input;
  const term = input.terms.find((t) => t.paymentId === payment.id && t.endsOn !== null);
  return {
    language: input.language,
    issuerName: input.issuerName,
    receiptNumber: payment.receiptNumber,
    memberName: `${payment.memberFirstName} ${payment.memberLastName}`,
    memberNumber: payment.memberNumber,
    tier: payment.toTier,
    kind: payment.kind,
    period: term ? { startsOn: term.startsOn, endsOn: term.endsOn! } : null,
    listFee: payment.listFee,
    discountPercent: payment.discountPercent,
    amount: payment.amount,
    method: payment.method,
    receivedOn: payment.receivedOn,
    agentName: input.agentName,
    voided: payment.voidedAt ? { reason: payment.voidReason ?? '', on: payment.voidedAt.toISOString().slice(0, 10) } : null,
  };
}

export interface IReceiptPdfRenderer {
  render(document: ReceiptDocument): Promise<Buffer>;
}
