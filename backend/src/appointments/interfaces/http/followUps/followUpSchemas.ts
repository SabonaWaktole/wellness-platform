import { z } from 'zod';
import { SCHEDULED_ACTIVITY_TYPES } from '../../../domain/followUps/ScheduledActivity';
import { addInteractionSchema } from '../../../../clients/interfaces/http/schemas/clientSchemas';

const id = z.string().trim().min(1);
const optionalId = id.nullable().optional();
const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');
const time = z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:mm.');
const intervalDays = z.number().int().min(1).max(365);

/**
 * Shapes only. Which deal, contact and salesperson are allowed, and whether
 * a time is in the past, are the use cases' rules, with their own field
 * errors.
 */
export const followUpSchemas = {
  schedule: z.object({
    clientId: id,
    dealId: optionalId,
    contactPersonId: optionalId,
    fromActivityId: optionalId,
    type: z.enum(SCHEDULED_ACTIVITY_TYPES).optional(),
    intervalDays: intervalDays.nullable().optional(),
    dueDate: dayKey.nullable().optional(),
    time: time.nullable().optional(),
    note: z.string().max(5000).nullable().optional(),
    assignedUserId: optionalId,
  }),
  reschedule: z.object({
    intervalDays: intervalDays.nullable().optional(),
    dueDate: dayKey.nullable().optional(),
    time: time.nullable().optional(),
    reason: z.string().max(5000).nullable().optional(),
  }),
  cancel: z.object({ reason: z.string().max(5000) }),
  reassign: z.object({ assignedUserId: id }),
  /** FR-FUP-06: the activity that happened, as when recording one (FR-ACT-02). */
  complete: addInteractionSchema,
  list: z.object({
    assignedUserId: id.optional(),
    dealId: id.optional(),
    clientId: id.optional(),
    overdueOnly: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => value === 'true'),
  }),
};
