import { DomainError } from '../../shared/domain/errors/DomainError';

export const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CARD', 'OTHER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_LIMITS = { note: 500, reason: 500 } as const;

export type PaymentField = 'kind' | 'targetTier' | 'method' | 'receivedOn' | 'note' | 'reason';

/** A payment request is refused. Mapped to 400 with the field. */
export class InvalidPaymentError extends DomainError {
  readonly code = 'INVALID_MEMBER_PAYMENT';

  constructor(
    readonly field: PaymentField,
    message: string
  ) {
    super(message);
  }
}

/** FR-MPAY-05: prefix, the calendar year and six digits, e.g. RCP-2027-000045. */
export const formatReceiptNumber = (prefix: string, year: number, sequence: number): string =>
  `${prefix}-${year}-${String(sequence).padStart(6, '0')}`;

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * FR-MPAY-01: the date the money was received, a real calendar day that is not
 * in the future. `today` is the workspace's day, YYYY-MM-DD.
 */
export function receivedOnDate(value: unknown, today: string): string {
  const match = typeof value === 'string' ? DAY.exec(value) : null;
  if (!match) throw new InvalidPaymentError('receivedOn', 'The date received must be a real date, YYYY-MM-DD.');
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const real = new Date(Date.UTC(year, month - 1, day));
  if (real.getUTCFullYear() !== year || real.getUTCMonth() !== month - 1 || real.getUTCDate() !== day || year < 2000) {
    throw new InvalidPaymentError('receivedOn', 'The date received must be a real date, YYYY-MM-DD.');
  }
  if ((value as string) > today) throw new InvalidPaymentError('receivedOn', 'The date received cannot be in the future.');
  return value as string;
}

export function paymentMethod(value: unknown): PaymentMethod {
  if (!PAYMENT_METHODS.includes(value as PaymentMethod)) {
    throw new InvalidPaymentError('method', 'The method is cash, bank transfer, card or other.');
  }
  return value as PaymentMethod;
}

export function optionalPaymentText(value: unknown, field: 'note' | 'reason', max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new InvalidPaymentError(field, 'This field must be text.');
  const text = value.trim();
  if (text === '') return null;
  if (text.length > max) throw new InvalidPaymentError(field, `This field is at most ${max} characters.`);
  return text;
}

/** FR-MPAY-06: a payment is voided with a reason. */
export function voidReason(value: unknown): string {
  const text = optionalPaymentText(value, 'reason', PAYMENT_LIMITS.reason);
  if (text === null) throw new InvalidPaymentError('reason', 'A reason is required to void a payment.');
  return text;
}
