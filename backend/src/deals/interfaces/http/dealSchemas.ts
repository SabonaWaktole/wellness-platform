import { z } from 'zod';
import { DealStage } from '../../domain/DealStage';
import { DealType } from '../../domain/DealType';
import { DEAL_SORT_FIELDS } from '../../application/ports/IDealStore';
import { pricingChoices } from '../../../pricing/interfaces/http/pricingSchemas';
import { OFFER_NOTE_MAX } from '../../../quotations/domain/Offer';

const STAGES = Object.values(DealStage) as [DealStage, ...DealStage[]];
const TYPES = Object.values(DealType) as [DealType, ...DealType[]];

/** `YYYY-MM-DD`, a real calendar date, kept as UTC midnight. */
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')
  .transform((value, ctx) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Not a calendar date.' });
      return z.NEVER;
    }
    return date;
  });

/** A monthly value in a query: a plain decimal with up to two places, kept as text (NFR-ACC-02). */
const money = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'Use an amount such as 49.40.');

/** A query value given once, repeated, or comma-separated. */
const list = <T extends [string, ...string[]]>(values: T) =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) =>
      value === undefined
        ? undefined
        : (Array.isArray(value) ? value : [value]).flatMap((part) => part.split(',')).map((part) => part.trim()).filter(Boolean)
    )
    .pipe(z.array(z.enum(values)).optional());

// The type and the title are checked by the domain, which names the field
// that failed; the edge only bounds sizes.
const dealFields = {
  type: z.string().max(50),
  title: z.string().max(1000).nullable(),
  expectedCloseDate: calendarDate.nullable(),
  notes: z.string().max(20000).nullable(),
};

export const dealSchemas = {
  create: z
    .object({
      clientId: z.string().min(1),
      type: dealFields.type,
      title: dealFields.title.optional(),
      ownerUserId: z.string().min(1).nullable().optional(),
      expectedCloseDate: dealFields.expectedCloseDate.optional(),
      notes: dealFields.notes.optional(),
    })
    .strict(),
  update: z.object(dealFields).partial().strict(),
  stage: z.object({ stage: z.string().min(1).max(50) }).strict(),
  reassign: z.object({ ownerUserId: z.string().min(1) }).strict(),
  list: z.object({
    clientId: z.string().optional(),
    ownerUserId: z.string().optional(),
    stage: list(STAGES),
    type: list(TYPES),
    businessTypeId: z.string().optional(),
    areaId: z.string().optional(),
    cityId: z.string().optional(),
    expectedCloseFrom: calendarDate.optional(),
    expectedCloseTo: calendarDate.optional(),
    q: z.string().max(200).optional(),
    valueMin: money.optional(),
    valueMax: money.optional(),
    sort: z.enum(DEAL_SORT_FIELDS).default('updatedAt'),
    direction: z.enum(['asc', 'desc']).default('desc'),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  }),
  column: z.object({ stage: z.enum(STAGES), cursor: z.string().max(500).optional() }),
  // Saving the pricing screen as the deal's draft offer (Slice 8). Not
  // strict: a risk level or amounts sent along are stripped, never read
  // (FR-PRC-03, FR-OFR-03).
  offer: z.object({
    ...pricingChoices,
    employees: z.number(),
    businessTypeId: z.string().min(1).max(64),
    frequencyId: z.string().min(1).max(64),
    packageId: z.string().min(1).max(64),
    note: z.string().max(OFFER_NOTE_MAX).nullable().optional(),
    alsoUpdateCompany: z.boolean().optional(),
    // FR-OFR-02: null is the company's primary contact; left out keeps the offer's.
    contactPersonId: z.string().min(1).max(64).nullable().optional(),
  }),
};
