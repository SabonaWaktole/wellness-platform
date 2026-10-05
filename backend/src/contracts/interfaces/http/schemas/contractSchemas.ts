import { z } from 'zod';
import { BillingPeriod, ContractStatus } from '../../../domain/Contract';

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

export const recordPaymentSchema = z.object({
  action: z.enum(['PAY', 'UNPAY', 'WAIVE']),
  /** Omitted on PAY means "in full" — see ContractPayment.recordPayment. */
  amount: z.coerce.number().positive().optional(),
  paidAt: dateString.optional(),
  method: z.string().max(120).nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
});

export const addPaymentSchema = z.object({
  dueDate: dateString,
  amount: z.coerce.number().min(0),
  method: z.string().max(120).nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
});

export const updatePaymentSchema = z.object({
  dueDate: dateString.optional(),
  amount: z.coerce.number().min(0).optional(),
  method: z.string().max(120).nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
});
