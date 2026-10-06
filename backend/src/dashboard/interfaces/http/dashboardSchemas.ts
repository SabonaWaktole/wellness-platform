import { z } from 'zod';
import { PERIOD_PRESETS } from '../../domain/PerformancePeriod';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');

/** The period and the optional narrowing of a dashboard. The scope is never a parameter: it comes from the role (FR-RBAC-23). */
export const dashboardSchema = z
  .object({
    preset: z.enum(PERIOD_PRESETS).default('THIS_MONTH'),
    from: day.optional(),
    to: day.optional(),
    salespersonId: z.string().min(1).optional(),
    areaId: z.string().min(1).optional(),
    cityId: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.preset === 'CUSTOM' && !(value.from && value.to)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Choose the first and last day.', path: ['from'] });
    }
  });
