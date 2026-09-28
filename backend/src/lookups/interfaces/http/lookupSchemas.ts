import { z } from 'zod';
import { LookupList } from '../../domain/LookupList';
import { MAX_LABEL_LENGTH } from '../../domain/LookupItem';

// Shape only. The rules (Albanian label required, level unique, risk level
// active) live in the domain and the list rules, so they hold for any caller.
const labels = {
  nameSq: z.string().max(MAX_LABEL_LENGTH),
  nameEn: z.string().max(MAX_LABEL_LENGTH).nullable().optional(),
};

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value === undefined ? undefined : value || null));

const listFields: Record<LookupList, z.ZodRawShape> = {
  [LookupList.RiskLevels]: {
    level: z.number().int(),
    description: optionalText(500),
  },
  [LookupList.BusinessTypes]: {
    riskLevelId: z.string().min(1),
  },
  [LookupList.Areas]: {},
  [LookupList.Cities]: {
    areaId: z.string().min(1),
  },
  [LookupList.FollowUpIntervals]: {
    days: z.number().int(),
  },
  [LookupList.LostReasons]: {},
};

export const lookupSchemas = {
  create: (list: LookupList) => z.object({ ...labels, ...listFields[list] }),
  update: (list: LookupList) => z.object({ ...labels, ...listFields[list] }).partial(),
  reorder: z.object({ ids: z.array(z.string().min(1)).max(1000) }),
  /** Deactivate (FR-SET-04): an area with active cities needs `cascade: true` to take them too. */
  deactivate: z.object({ cascade: z.boolean().optional() }),
};
