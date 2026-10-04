import { NotificationType, NOTIFICATION_TYPES, isNotificationType } from './NotificationType';
import { UserRole } from '../../auth/domain/enums/UserRole';

export interface NotificationSettingsProps {
  tenantId: string;
  emailEnabled: boolean;
  emailEventTypes: NotificationType[];
  emailRecipientRoles: UserRole[];
  appointmentRemindersEnabled: boolean;
  appointmentReminderLeadMinutes: number;
  quotationFollowUpEnabled: boolean;
  quotationFollowUpDays: number;
  quotationAutoExpireEnabled: boolean;
  quotationExpiryDays: number;
  /** M2 Slice 10: a pending discount approval older than this many hours reminds its approvers once (FR-DSC-12). */
  discountApprovalReminderHours: number;
  /** M2 Slice 11: a follow-up coming due notifies its salesperson in the app (FR-FUP-09). */
  followUpDueNotificationsEnabled: boolean;
  /** M2 Slice 11: the 07:30 summary of each salesperson's day, in the app and by email (FR-FUP-09). */
  followUpDailySummaryEnabled: boolean;
}

/** The subset a caller may change. Every field optional — this is a PATCH. */
export type NotificationSettingsPatch = Partial<Omit<NotificationSettingsProps, 'tenantId'>>;

/**
 * Roles that can meaningfully appear in `emailRecipientRoles`.
 *
 * SUPER_ADMIN is absent by construction, not by oversight: it is a
 * platform-level role that never belongs to a tenant, so it can never be a
 * recipient of a tenant's business email. Admitting it here would let a
 * workspace's own settings page reach outside the workspace.
 */
export const EMAILABLE_ROLES: UserRole[] = [UserRole.BUSINESS_OWNER, UserRole.STAFF];

/**
 * Bounds on the timing fields.
 *
 * These are guard rails, not preferences. A zero lead time means a reminder
 * that arrives as the appointment starts, which is not a reminder; a follow-up
 * of zero days means chasing a customer the moment the quotation lands. The
 * upper bounds keep a typo (1440 days instead of 1440 minutes) from scheduling
 * work four years out.
 */
export const LIMITS = {
  reminderLeadMinutes: { min: 15, max: 60 * 24 * 14 }, // 15 minutes … 14 days
  followUpDays: { min: 1, max: 90 },
  expiryDays: { min: 1, max: 365 },
  // 1 hour … 7 days: below an hour the reminder races the approver, above a
  // week it stops being a reminder (FR-DSC-12).
  discountApprovalReminderHours: { min: 1, max: 168 },
} as const;

export class InvalidNotificationSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidNotificationSettingsError';
  }
}

/**
 * One workspace's notification policy (§6.6).
 *
 * A tenant with no stored row is not misconfigured — it is on the defaults.
 * `defaults()` is therefore a first-class constructor rather than a fallback
 * scattered across read sites, which is what lets the migration ship without a
 * backfill.
 */
export class NotificationSettings {
  readonly tenantId: string;
  readonly emailEnabled: boolean;
  readonly emailEventTypes: NotificationType[];
  readonly emailRecipientRoles: UserRole[];
  readonly appointmentRemindersEnabled: boolean;
  readonly appointmentReminderLeadMinutes: number;
  readonly quotationFollowUpEnabled: boolean;
  readonly quotationFollowUpDays: number;
  readonly quotationAutoExpireEnabled: boolean;
  readonly quotationExpiryDays: number;
  readonly discountApprovalReminderHours: number;
  readonly followUpDueNotificationsEnabled: boolean;
  readonly followUpDailySummaryEnabled: boolean;

  private constructor(props: NotificationSettingsProps) {
    this.tenantId = props.tenantId;
    this.emailEnabled = props.emailEnabled;
    this.emailEventTypes = props.emailEventTypes;
    this.emailRecipientRoles = props.emailRecipientRoles;
    this.appointmentRemindersEnabled = props.appointmentRemindersEnabled;
    this.appointmentReminderLeadMinutes = props.appointmentReminderLeadMinutes;
    this.quotationFollowUpEnabled = props.quotationFollowUpEnabled;
    this.quotationFollowUpDays = props.quotationFollowUpDays;
    this.quotationAutoExpireEnabled = props.quotationAutoExpireEnabled;
    this.quotationExpiryDays = props.quotationExpiryDays;
    this.discountApprovalReminderHours = props.discountApprovalReminderHours;
    this.followUpDueNotificationsEnabled = props.followUpDueNotificationsEnabled;
    this.followUpDailySummaryEnabled = props.followUpDailySummaryEnabled;
  }

  /**
   * What a workspace gets before anyone visits the settings page.
   *
   * Email defaults to the events an owner would want to hear about away from
   * the app — a customer answering a quotation, and work waiting on their own
   * approval — rather than to everything. Defaulting to all eleven types would
   * teach every new owner to filter our mail.
   *
   * Auto-expiry defaults OFF because it changes business records on a timer;
   * an owner should opt into that deliberately. Reminders and follow-ups only
   * send messages, so they default ON.
   */
  static defaults(tenantId: string): NotificationSettings {
    return new NotificationSettings({
      tenantId,
      emailEnabled: true,
      emailEventTypes: [
        'QUOTATION_SUBMITTED_FOR_APPROVAL',
        'QUOTATION_ACCEPTED',
        'QUOTATION_REJECTED',
        'APPOINTMENT_ASSIGNED',
        'APPOINTMENT_CANCELLED',
        'APPOINTMENT_REMINDER',
        'QUOTATION_FOLLOW_UP',
      ],
      emailRecipientRoles: [UserRole.BUSINESS_OWNER, UserRole.STAFF],
      appointmentRemindersEnabled: true,
      appointmentReminderLeadMinutes: 1440,
      quotationFollowUpEnabled: true,
      quotationFollowUpDays: 3,
      quotationAutoExpireEnabled: false,
      quotationExpiryDays: 30,
      discountApprovalReminderHours: 24,
      followUpDueNotificationsEnabled: true,
      followUpDailySummaryEnabled: false,
    });
  }

  /** Rehydrate from storage, dropping values the catalogue no longer knows. */
  static fromPersistence(props: {
    tenantId: string;
    emailEnabled: boolean;
    emailEventTypes: string[];
    emailRecipientRoles: string[];
    appointmentRemindersEnabled: boolean;
    appointmentReminderLeadMinutes: number;
    quotationFollowUpEnabled: boolean;
    quotationFollowUpDays: number;
    quotationAutoExpireEnabled: boolean;
    quotationExpiryDays: number;
    discountApprovalReminderHours?: number;
    followUpDueNotificationsEnabled?: boolean;
    followUpDailySummaryEnabled?: boolean;
  }): NotificationSettings {
    return new NotificationSettings({
      ...props,
      discountApprovalReminderHours: props.discountApprovalReminderHours ?? 24,
      followUpDueNotificationsEnabled: props.followUpDueNotificationsEnabled ?? true,
      followUpDailySummaryEnabled: props.followUpDailySummaryEnabled ?? false,
      // A stored type that has since been removed from the catalogue is
      // filtered out rather than throwing. A settings row must never be able to
      // make a workspace unreadable.
      emailEventTypes: props.emailEventTypes.filter(isNotificationType),
      emailRecipientRoles: props.emailRecipientRoles.filter((r): r is UserRole =>
        EMAILABLE_ROLES.includes(r as UserRole)
      ),
    });
  }

  /**
   * Apply a patch, validating the result rather than the input.
   *
   * Validating the whole resulting object means a patch cannot leave the row in
   * a state that a full write would have rejected.
   */
  withPatch(patch: NotificationSettingsPatch): NotificationSettings {
    const next = new NotificationSettings({
      tenantId: this.tenantId,
      emailEnabled: patch.emailEnabled ?? this.emailEnabled,
      emailEventTypes: patch.emailEventTypes ?? this.emailEventTypes,
      emailRecipientRoles: patch.emailRecipientRoles ?? this.emailRecipientRoles,
      appointmentRemindersEnabled:
        patch.appointmentRemindersEnabled ?? this.appointmentRemindersEnabled,
      appointmentReminderLeadMinutes:
        patch.appointmentReminderLeadMinutes ?? this.appointmentReminderLeadMinutes,
      quotationFollowUpEnabled: patch.quotationFollowUpEnabled ?? this.quotationFollowUpEnabled,
      quotationFollowUpDays: patch.quotationFollowUpDays ?? this.quotationFollowUpDays,
      quotationAutoExpireEnabled:
        patch.quotationAutoExpireEnabled ?? this.quotationAutoExpireEnabled,
      quotationExpiryDays: patch.quotationExpiryDays ?? this.quotationExpiryDays,
      discountApprovalReminderHours:
        patch.discountApprovalReminderHours ?? this.discountApprovalReminderHours,
      followUpDueNotificationsEnabled:
        patch.followUpDueNotificationsEnabled ?? this.followUpDueNotificationsEnabled,
      followUpDailySummaryEnabled: patch.followUpDailySummaryEnabled ?? this.followUpDailySummaryEnabled,
    });
    next.assertValid();
    return next;
  }

  private assertValid(): void {
    for (const type of this.emailEventTypes) {
      if (!isNotificationType(type)) {
        throw new InvalidNotificationSettingsError(`Unknown notification type: ${type}`);
      }
    }
    for (const role of this.emailRecipientRoles) {
      if (!EMAILABLE_ROLES.includes(role)) {
        throw new InvalidNotificationSettingsError(`Role cannot receive workspace email: ${role}`);
      }
    }
    assertInRange(
      'appointmentReminderLeadMinutes',
      this.appointmentReminderLeadMinutes,
      LIMITS.reminderLeadMinutes
    );
    assertInRange('quotationFollowUpDays', this.quotationFollowUpDays, LIMITS.followUpDays);
    assertInRange('quotationExpiryDays', this.quotationExpiryDays, LIMITS.expiryDays);
    assertInRange(
      'discountApprovalReminderHours',
      this.discountApprovalReminderHours,
      LIMITS.discountApprovalReminderHours
    );

    /*
     * A follow-up that fires after expiry would chase a customer about a
     * quotation the system had already closed. Rejecting the combination is
     * better than silently ordering the two jobs, because the owner who set it
     * meant one of them and should be told which one is impossible.
     */
    if (this.quotationAutoExpireEnabled && this.quotationFollowUpEnabled) {
      if (this.quotationFollowUpDays >= this.quotationExpiryDays) {
        throw new InvalidNotificationSettingsError(
          'Follow-up must happen before expiry: quotationFollowUpDays must be less than quotationExpiryDays.'
        );
      }
    }
  }

  /**
   * Does this event type email at all, for anyone?
   *
   * The follow-up daily summary is an email by definition (FR-FUP-09), so its
   * own switch governs it rather than the event list, and it is left out of
   * `availableEventTypes`.
   */
  emailsFor(type: NotificationType): boolean {
    if (type === 'FOLLOW_UP_DAILY_SUMMARY') return this.emailEnabled && this.followUpDailySummaryEnabled;
    return this.emailEnabled && this.emailEventTypes.includes(type);
  }

  /** Does this event type email a holder of this role? */
  emailsRole(type: NotificationType, role: string): boolean {
    return this.emailsFor(type) && this.emailRecipientRoles.includes(role as UserRole);
  }

  toJSON() {
    return {
      emailEnabled: this.emailEnabled,
      emailEventTypes: this.emailEventTypes,
      emailRecipientRoles: this.emailRecipientRoles,
      appointmentRemindersEnabled: this.appointmentRemindersEnabled,
      appointmentReminderLeadMinutes: this.appointmentReminderLeadMinutes,
      quotationFollowUpEnabled: this.quotationFollowUpEnabled,
      quotationFollowUpDays: this.quotationFollowUpDays,
      quotationAutoExpireEnabled: this.quotationAutoExpireEnabled,
      quotationExpiryDays: this.quotationExpiryDays,
      discountApprovalReminderHours: this.discountApprovalReminderHours,
      followUpDueNotificationsEnabled: this.followUpDueNotificationsEnabled,
      followUpDailySummaryEnabled: this.followUpDailySummaryEnabled,
      // The catalogue travels with the settings so the UI never hard-codes a
      // list that can fall behind the server's.
      availableEventTypes: NOTIFICATION_TYPES.filter((type) => type !== 'FOLLOW_UP_DAILY_SUMMARY'),
      availableRecipientRoles: EMAILABLE_ROLES,
      limits: LIMITS,
    };
  }
}

function assertInRange(
  field: string,
  value: number,
  range: { min: number; max: number }
): void {
  if (!Number.isInteger(value) || value < range.min || value > range.max) {
    throw new InvalidNotificationSettingsError(
      `${field} must be a whole number between ${range.min} and ${range.max}.`
    );
  }
}
