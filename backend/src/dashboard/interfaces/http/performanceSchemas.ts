import { z } from 'zod';
import { PERIOD_PRESETS } from '../../domain/PerformancePeriod';
import { PERFORMANCE_INDICATORS } from '../../application/wellness/ports/IPerformanceReader';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');

/** `a,b` or `a&salespersonIds=b`, as the screen's multi-select sends them. */
const idList = z
  .union([z.string(), z.array(z.string())])
  .transform((value) => (Array.isArray(value) ? value : value.split(',')).map((id) => id.trim()).filter(Boolean))
  .optional();

const bool = z.enum(['true', 'false']).transform((value) => value === 'true');

/** The period and the salespeople. The scope is never a parameter: it comes from the access context (FR-RBAC-23). */
const filters = {
  preset: z.enum(PERIOD_PRESETS).default('THIS_MONTH'),
  from: day.optional(),
  to: day.optional(),
  salespersonIds: idList,
};

const customNeedsBothDays = (value: { preset: string; from?: string; to?: string }, ctx: z.RefinementCtx) => {
  if (value.preset === 'CUSTOM' && !(value.from && value.to)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Choose the first and last day.', path: ['from'] });
  }
};

export const performanceSchema = z.object({ ...filters, compare: bool.optional() }).superRefine(customNeedsBothDays);

export const performanceRecordsSchema = z
  .object({
    ...filters,
    indicator: z.enum(PERFORMANCE_INDICATORS),
    salespersonId: z.string().min(1).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .superRefine(customNeedsBothDays);

export const performanceSeriesSchema = z
  .object({
    preset: z.enum(PERIOD_PRESETS).default('THIS_YEAR'),
    from: day.optional(),
    to: day.optional(),
    salespersonId: z.string().min(1),
    grain: z.enum(['WEEK', 'MONTH']).default('MONTH'),
  })
  .superRefine(customNeedsBothDays);

export const performanceExportSchema = z
  .object({ ...filters, compare: bool.optional(), format: z.enum(['csv', 'pdf']).default('csv'), locale: z.enum(['sq', 'en']).default('sq') })
  .superRefine(customNeedsBothDays);
