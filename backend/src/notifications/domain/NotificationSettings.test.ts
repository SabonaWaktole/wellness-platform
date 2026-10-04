import {
  NotificationSettings,
  InvalidNotificationSettingsError,
  LIMITS,
} from './NotificationSettings';
import { UserRole } from '../../auth/domain/enums/UserRole';

describe('NotificationSettings', () => {
  const tenantId = 'tenant-1';

  describe('defaults', () => {
    it('gives an unconfigured workspace a working policy', () => {
      const settings = NotificationSettings.defaults(tenantId);

      expect(settings.emailEnabled).toBe(true);
      expect(settings.appointmentRemindersEnabled).toBe(true);
      expect(settings.quotationFollowUpEnabled).toBe(true);
    });

    it('leaves automatic expiry off, because it changes records rather than sending mail', () => {
      expect(NotificationSettings.defaults(tenantId).quotationAutoExpireEnabled).toBe(false);
    });

    it('defaults the follow-up window inside the expiry window', () => {
      // The two are only both active if an owner switches expiry on, and the
      // entity refuses that combination when it is inverted — so the shipped
      // defaults must not be the ones it would reject.
      const settings = NotificationSettings.defaults(tenantId);
      expect(settings.quotationFollowUpDays).toBeLessThan(settings.quotationExpiryDays);
    });
  });

  describe('fromPersistence', () => {
    const row = {
      tenantId,
      emailEnabled: true,
      emailEventTypes: ['QUOTATION_ACCEPTED', 'A_TYPE_WE_REMOVED'],
      emailRecipientRoles: ['BUSINESS_OWNER', 'SUPER_ADMIN'],
      appointmentRemindersEnabled: true,
      appointmentReminderLeadMinutes: 60,
      quotationFollowUpEnabled: true,
      quotationFollowUpDays: 3,
      quotationAutoExpireEnabled: false,
      quotationExpiryDays: 30,
    };

    it('drops event types the catalogue no longer knows instead of throwing', () => {
      const settings = NotificationSettings.fromPersistence(row);
      expect(settings.emailEventTypes).toEqual(['QUOTATION_ACCEPTED']);
    });

    it('drops roles that cannot receive workspace email', () => {
      // SUPER_ADMIN belongs to no tenant, so a stored row naming it must not
      // resurrect a cross-tenant recipient.
      const settings = NotificationSettings.fromPersistence(row);
      expect(settings.emailRecipientRoles).toEqual([UserRole.BUSINESS_OWNER]);
    });
  });

  describe('withPatch', () => {
    it('leaves absent keys alone', () => {
      const before = NotificationSettings.defaults(tenantId);
      const after = before.withPatch({ emailEnabled: false });

      expect(after.emailEnabled).toBe(false);
      expect(after.appointmentReminderLeadMinutes).toBe(before.appointmentReminderLeadMinutes);
    });

    it('rejects a reminder lead time below the minimum', () => {
      expect(() =>
        NotificationSettings.defaults(tenantId).withPatch({
          appointmentReminderLeadMinutes: LIMITS.reminderLeadMinutes.min - 1,
        })
      ).toThrow(InvalidNotificationSettingsError);
    });

    it('rejects a non-integer lead time', () => {
      expect(() =>
        NotificationSettings.defaults(tenantId).withPatch({
          appointmentReminderLeadMinutes: 90.5,
        })
      ).toThrow(InvalidNotificationSettingsError);
    });

    it('rejects a follow-up that would fire after expiry', () => {
      expect(() =>
        NotificationSettings.defaults(tenantId).withPatch({
          quotationAutoExpireEnabled: true,
          quotationFollowUpDays: 30,
          quotationExpiryDays: 30,
        })
      ).toThrow(/before expiry/);
    });

    it('allows a late follow-up when automatic expiry is off', () => {
      // Nothing closes the quotation, so a chase at day 40 is still meaningful.
      const settings = NotificationSettings.defaults(tenantId).withPatch({
        quotationAutoExpireEnabled: false,
        quotationFollowUpDays: 40,
        quotationExpiryDays: 30,
      });

      expect(settings.quotationFollowUpDays).toBe(40);
    });

    it('validates the result, not the patch', () => {
      // The patch alone looks fine; it is only invalid against what is already
      // stored. Validating the input would have let this through.
      const withExpiry = NotificationSettings.defaults(tenantId).withPatch({
        quotationAutoExpireEnabled: true,
        quotationExpiryDays: 10,
        quotationFollowUpDays: 5,
      });

      expect(() => withExpiry.withPatch({ quotationFollowUpDays: 20 })).toThrow(
        InvalidNotificationSettingsError
      );
    });

    it('rejects a role that cannot receive workspace email', () => {
      expect(() =>
        NotificationSettings.defaults(tenantId).withPatch({
          emailRecipientRoles: [UserRole.SUPER_ADMIN],
        })
      ).toThrow(InvalidNotificationSettingsError);
    });
  });

  describe('emailsFor / emailsRole', () => {
    it('sends nothing at all when the master switch is off', () => {
      const settings = NotificationSettings.defaults(tenantId).withPatch({
        emailEnabled: false,
      });

      expect(settings.emailsFor('QUOTATION_ACCEPTED')).toBe(false);
      expect(settings.emailsRole('QUOTATION_ACCEPTED', UserRole.BUSINESS_OWNER)).toBe(false);
    });

    it('sends only the types that are switched on', () => {
      const settings = NotificationSettings.defaults(tenantId).withPatch({
        emailEventTypes: ['QUOTATION_ACCEPTED'],
      });

      expect(settings.emailsFor('QUOTATION_ACCEPTED')).toBe(true);
      expect(settings.emailsFor('QUOTATION_REJECTED')).toBe(false);
    });

    it('filters by recipient role as well as by type', () => {
      const settings = NotificationSettings.defaults(tenantId).withPatch({
        emailEventTypes: ['QUOTATION_ACCEPTED'],
        emailRecipientRoles: [UserRole.BUSINESS_OWNER],
      });

      expect(settings.emailsRole('QUOTATION_ACCEPTED', UserRole.BUSINESS_OWNER)).toBe(true);
      expect(settings.emailsRole('QUOTATION_ACCEPTED', UserRole.STAFF)).toBe(false);
    });
  });

  it('ships the catalogue with the settings so the UI cannot fall behind', () => {
    const json = NotificationSettings.defaults(tenantId).toJSON();

    expect(json.availableEventTypes).toContain('APPOINTMENT_REMINDER');
    expect(json.availableRecipientRoles).not.toContain(UserRole.SUPER_ADMIN);
  });

  it('FR-FUP-09 the follow-up notice is on and the daily summary off by default', () => {
    const settings = NotificationSettings.defaults(tenantId);
    expect(settings.followUpDueNotificationsEnabled).toBe(true);
    expect(settings.followUpDailySummaryEnabled).toBe(false);
  });

  it('FR-FUP-09 the daily summary emails when its own switch is on, not through the event list', () => {
    const off = NotificationSettings.defaults(tenantId);
    expect(off.emailsFor('FOLLOW_UP_DAILY_SUMMARY')).toBe(false);

    const on = off.withPatch({ followUpDailySummaryEnabled: true });
    expect(on.emailsFor('FOLLOW_UP_DAILY_SUMMARY')).toBe(true);
    expect(on.withPatch({ emailEnabled: false }).emailsFor('FOLLOW_UP_DAILY_SUMMARY')).toBe(false);
    expect(on.toJSON().availableEventTypes).not.toContain('FOLLOW_UP_DAILY_SUMMARY');
  });
});

