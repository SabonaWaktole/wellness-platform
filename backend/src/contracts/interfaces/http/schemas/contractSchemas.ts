import { z } from 'zod';
import { BillingPeriod, ContractStatus } from '../../../domain/Contract';
import { PaymentStatus } from '../../../domain/ContractPayment';

/**
 * Dates arrive as plain strings and are parsed by the controller — `startsAt`
 * may be a full ISO datetime or a bare `YYYY-MM-DD`, and coercing both through
 * `new Date(...)` there is simpler than two zod branches here. Same convention
 * as `convertToInvoiceSchema.dueDate`.
 */
const dateString = z.string().min(1);

export const createContractSchema = z.object({
  clientId: z.string().min(1, 'Invalid clientId'),
  planName: z.string().min(1, 'Plan name is required').max(120),
  amount: z.coerce.number().min(0),
  billingPeriod: z.nativeEnum(BillingPeriod),
  startsAt: dateString,
  endsAt: dateString,
  assignedUserId: z.string().min(1).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

/**
 * Creating from a won deal (FR-CON-01..04). Strict: the price, annual value,
 * package and services are read from the deal and cannot be typed, so a body
 * that names them is refused rather than ignored.
 */
export const createContractFromDealSchema = z
  .object({
    dealId: z.string().min(1, 'Choose the deal'),
    startsAt: dateString.optional(),
    endsAt: dateString.optional(),
    billingPeriod: z.nativeEnum(BillingPeriod).optional(),
  })
  .strict();

const richTextDocument = z.union([z.string().max(20000), z.record(z.unknown())]).nullable();

export const updateContractSchema = z.object({
  planName: z.string().min(1).max(120).optional(),
  amount: z.coerce.number().min(0).optional(),
  billingPeriod: z.nativeEnum(BillingPeriod).optional(),
  startsAt: dateString.optional(),
  endsAt: dateString.optional(),
  assignedUserId: z.string().min(1).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  renewalDate: dateString.nullable().optional(),
  termsText: z.object({ sq: richTextDocument.optional(), en: richTextDocument.optional() }).nullable().optional(),
});

export const renewContractSchema = z.object({
  planName: z.string().min(1).max(120).optional(),
  amount: z.coerce.number().min(0).optional(),
  billingPeriod: z.nativeEnum(BillingPeriod).optional(),
  startsAt: dateString.optional(),
  endsAt: dateString.optional(),
  notes: z.string().max(5000).nullable().optional(),
});

/** Starting a Renewal deal: the salesperson defaults to the contract's (FR-REN-06). */
export const startRenewalSchema = z.object({
  ownerUserId: z.string().min(1).optional(),
});

export const cancelContractSchema = z.object({
  reason: z.string().max(500).nullable().optional(),
});

/** Any status change (FR-CON-11): the target, and the reason where the transition table asks for one. */
export const changeContractStatusSchema = z.object({
  status: z.nativeEnum(ContractStatus),
  reason: z.string().max(500).nullable().optional(),
});

export const searchContractsSchema = z.object({
  query: z.string().optional(),
  status: z.nativeEnum(ContractStatus).optional(),
  clientId: z.string().min(1).optional(),
  assignedUserId: z.string().min(1).optional(),
  /**
   * Capped at two years. The renewals view is a worklist, and an uncapped
   * horizon turns it into "every contract", which is what the unfiltered list
   * is already for.
   */
  expiringWithinDays: z.coerce.number().int().min(0).max(730).optional(),
  /** Valid today, valid and ending within the expiring-soon window, or not valid (FR-CON-08). */
  validity: z.enum(['VALID', 'EXPIRING_SOON', 'NOT_VALID']).optional(),
  /** End date range, `YYYY-MM-DD`, both ends included (FR-CON-08). */
  endsFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endsTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** Any instalment Overdue (FR-CON-08). */
  hasOverdue: z.enum(['true', 'false']).optional(),
  areaId: z.string().min(1).optional(),
  cityId: z.string().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

/**
 * An amount as the client sends it: a two-decimal string, or a number that
 * reads as one. Anything with more than two decimals is refused rather than
 * rounded, so a mistyped figure is not silently changed (NFR-ACC-03).
 */
const money = z
  .union([z.string().trim(), z.number()])
  .transform((value) => String(value))
  .refine((value) => /^\d{1,10}(\.\d{1,2})?$/.test(value), { message: 'Enter an amount with at most two decimals' });

const PAYMENT_STATUS_CHOICES = ['NOT_INVOICED', 'INVOICE_ISSUED', 'PAYMENT_PENDING'] as const;

export const addPaymentSchema = z.object({
  dueDate: dateString,
  amount: money,
  reason: z.string().max(2000),
  note: z.string().max(1000).nullable().optional(),
});

export const updatePaymentSchema = z.object({
  dueDate: dateString.optional(),
  amount: money.optional(),
  note: z.string().max(1000).nullable().optional(),
  /** Required by the rule when the due date or amount changes. */
  reason: z.string().max(2000).nullable().optional(),
});

export const deletePaymentSchema = z.object({ reason: z.string().max(2000) });

export const recordInvoiceSchema = z.object({
  invoiceNumber: z.string().max(120),
  invoiceDate: dateString,
});

export const markPendingSchema = z.object({ comment: z.string().max(2000).nullable().optional() });

export const recordReceiptSchema = z.object({
  amount: money,
  receivedOn: dateString,
  method: z.string().max(40),
  comment: z.string().max(2000).nullable().optional(),
});

export const reverseReceiptSchema = z.object({
  amount: money,
  comment: z.string().max(2000),
});

export const correctPaymentStatusSchema = z.object({
  status: z.enum(PAYMENT_STATUS_CHOICES),
  comment: z.string().max(2000),
});

const dayString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** The Payments overview's filters and the export's (FR-PAY-11, FR-PAY-14). */
export const paymentFiltersSchema = z.object({
  status: z.nativeEnum(PaymentStatus).optional(),
  clientId: z.string().min(1).optional(),
  assignedUserId: z.string().min(1).optional(),
  contractId: z.string().min(1).optional(),
  /** Part of the company's name or the contract's number. */
  query: z.string().max(100).optional(),
  /** Due date range, both ends included. */
  dueFrom: dayString.optional(),
  dueTo: dayString.optional(),
  /** Past due and still Not Invoiced (FR-PAY-09). */
  dueNotInvoiced: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  areaId: z.string().min(1).optional(),
  cityId: z.string().min(1).optional(),
});

export const searchPaymentsSchema = paymentFiltersSchema.extend({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
