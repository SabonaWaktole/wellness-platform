import { apiClient } from '../api';

export type NotificationEventType = string;
export type NotificationRecipientRole = 'BUSINESS_OWNER' | 'STAFF';

export interface NotificationSettingsLimits {
  reminderLeadMinutes: { min: number; max: number };
  followUpDays: { min: number; max: number };
  expiryDays: { min: number; max: number };
  discountApprovalReminderHours: { min: number; max: number };
}

export interface NotificationSettings {
  emailEnabled: boolean;
  emailEventTypes: NotificationEventType[];
  emailRecipientRoles: NotificationRecipientRole[];
  appointmentRemindersEnabled: boolean;
  appointmentReminderLeadMinutes: number;
  quotationFollowUpEnabled: boolean;
  quotationFollowUpDays: number;
  quotationAutoExpireEnabled: boolean;
  quotationExpiryDays: number;
  /** M2 Slice 10: a pending discount approval older than this many hours reminds its approvers once. */
  discountApprovalReminderHours: number;

  /*
   * Served with the settings rather than hard-coded here. The catalogue of
   * notification types lives on the server and grows there; a copy in this file
   * would silently fall behind and the settings page would stop offering new
   * events.
   */
  availableEventTypes: NotificationEventType[];
  availableRecipientRoles: NotificationRecipientRole[];
  limits: NotificationSettingsLimits;
}

/** Only the mutable half — the catalogue and limits are read-only. */
export type NotificationSettingsPatch = Partial<
  Omit<NotificationSettings, 'availableEventTypes' | 'availableRecipientRoles' | 'limits'>
>;

export const notificationSettingsService = {
  get: async (tenantSlug: string): Promise<NotificationSettings> => {
    const response = await apiClient.get<NotificationSettings>(
      `/${tenantSlug}/notifications/settings`
    );
    return response.data;
  },

  update: async (
    tenantSlug: string,
    patch: NotificationSettingsPatch
  ): Promise<NotificationSettings> => {
    const response = await apiClient.put<NotificationSettings>(
      `/${tenantSlug}/notifications/settings`,
      patch
    );
    return response.data;
  },
};
