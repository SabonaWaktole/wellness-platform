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

export const updateContractSchema = z.object({
  planName: z.string().min(1).max(120).optional(),
  amount: z.coerce.number().min(0).optional(),
  billingPeriod: z.nativeEnum(BillingPeriod).optional(),
  startsAt: dateString.optional(),
  endsAt: dateString.optional(),
  assignedUserId: z.string().min(1).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
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
