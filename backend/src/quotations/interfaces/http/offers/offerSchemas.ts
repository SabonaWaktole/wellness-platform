import { z } from 'zod';
import { QuotationStatus } from '../../../domain/Quotation';
import { OFFER_RESPONSE_NOTE_MAX } from '../../../application/offers/RecordOfferResponseUseCase';

const STATUSES = Object.values(QuotationStatus) as [QuotationStatus, ...QuotationStatus[]];

/** `YYYY-MM-DD`, a real calendar date, kept as text. */
const calendarDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Not a calendar date.');

const statuses = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) =>
    value === undefined
      ? undefined
      : (Array.isArray(value) ? value : [value]).flatMap((part) => part.split(',')).map((part) => part.trim()).filter(Boolean)
  )
  .pipe(z.array(z.enum(STATUSES)).optional());

export const offerSchemas = {
  /** FR-OFR-14: status, salesperson, company and date. */
  list: z.object({
    status: statuses,
    ownerUserId: z.string().min(1).max(64).optional(),
    clientId: z.string().min(1).max(64).optional(),
    q: z.string().max(200).optional(),
    createdFrom: calendarDay.optional(),
    createdTo: calendarDay.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  }),
  /** FR-OFR-06: the language is chosen at download, Albanian by default. */
  pdf: z.object({
    lang: z.enum(['sq', 'en']).default('sq'),
    disposition: z.enum(['inline', 'attachment']).default('attachment'),
  }),
  /** FR-OFR-10: the date the salesperson emailed it. */
  markSent: z.object({ sentDate: calendarDay }).strict(),
  /** FR-OFR-12: an optional note. */
  respond: z.object({ note: z.string().max(OFFER_RESPONSE_NOTE_MAX).nullable().optional() }).strict(),
  empty: z.object({}).strict(),
};
