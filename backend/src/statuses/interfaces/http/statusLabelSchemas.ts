import { z } from 'zod';

export const statusLabelSchemas = {
  update: z.object({
    labelSq: z.string().max(100),
    labelEn: z.string().max(100).nullable().optional(),
    colour: z.string(),
  }),
  reorder: z.object({ keys: z.array(z.string().min(1)).max(100) }),
};
