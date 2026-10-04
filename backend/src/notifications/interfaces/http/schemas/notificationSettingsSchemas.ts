import { z } from 'zod';
import { NOTIFICATION_TYPES } from '../../../domain/NotificationType';
import { EMAILABLE_ROLES, LIMITS } from '../../../domain/NotificationSettings';
import { UserRole } from '../../../../auth/domain/enums/UserRole';

/**
 * Shape validation for a settings PATCH.
 *
 * Deliberately shallow: it checks that values are of the right kind and within
 * the numeric bounds, and stops there. The rules that relate fields to one
 * another — a follow-up must fire before expiry — live on the entity, because
 * they are true of the workspace's policy regardless of how it was submitted.
 *
 * `.strict()` so a typo'd key is a 400 rather than a silently ignored setting.
 * A settings form that reports success while dropping a field is worse than one
 * that fails.
 */
export const notificationSettingsSchema = z
  .object({
    emailEnabled: z.boolean().optional(),
    emailEventTypes: z.array(z.enum(NOTIFICATION_TYPES)).optional(),
    // Typed as the UserRole union rather than string[], so the parsed value
    // drops straight into NotificationSettingsPatch without a cast at the
    // controller — the whole point of parsing being the source of the type.
    emailRecipientRoles: z
      .array(z.enum(EMAILABLE_ROLES as [UserRole, ...UserRole[]]))
      .optional(),

    appointmentRemindersEnabled: z.boolean().optional(),
    appointmentReminderLeadMinutes: z
      .number()
      .int()
      .min(LIMITS.reminderLeadMinutes.min)
      .max(LIMITS.reminderLeadMinutes.max)
      .optional(),

    quotationFollowUpEnabled: z.boolean().optional(),
    quotationFollowUpDays: z
      .number()
      .int()
      .min(LIMITS.followUpDays.min)
      .max(LIMITS.followUpDays.max)
      .optional(),

    quotationAutoExpireEnabled: z.boolean().optional(),
    quotationExpiryDays: z
      .number()
      .int()
      .min(LIMITS.expiryDays.min)
      .max(LIMITS.expiryDays.max)
      .optional(),

    discountApprovalReminderHours: z
      .number()
      .int()
      .min(LIMITS.discountApprovalReminderHours.min)
      .max(LIMITS.discountApprovalReminderHours.max)
      .optional(),

    followUpDueNotificationsEnabled: z.boolean().optional(),
    followUpDailySummaryEnabled: z.boolean().optional(),
  })
  .strict();

export type NotificationSettingsInput = z.infer<typeof notificationSettingsSchema>;
