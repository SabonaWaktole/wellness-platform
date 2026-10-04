/**
 * The catalogue of things that can produce a notification.
 *
 * Each value is an **i18n key suffix**, not a message. The frontend renders
 * `notifications:type.<value>` with the row's `params`. Nothing here is ever
 * user-visible text, which is the point: a notification written today is read
 * days later, possibly by someone whose interface language changed in between.
 * Storing the rendered sentence would freeze one language into the row — the
 * problem TD-016 describes for server error messages, but far more durable and
 * far more visible.
 *
 * Adding a value REQUIRES adding `type.<value>` to both `en` and `sq`
 * catalogues. `npm run check:translations` enforces the pair.
 */
export const NOTIFICATION_TYPES = [
  // Quotations — one per transition the domain already records in
  // QuotationStatusHistory.
  'QUOTATION_SUBMITTED_FOR_APPROVAL',
  'QUOTATION_APPROVED',
  'QUOTATION_RETURNED_TO_DRAFT',
  'QUOTATION_ACCEPTED',
  'QUOTATION_REJECTED',
  'QUOTATION_EXPIRED',

  // Appointments.
  'APPOINTMENT_ASSIGNED',
  'APPOINTMENT_RESCHEDULED',
  'APPOINTMENT_CANCELLED',

  /*
   * The two scheduled types. Unlike every value above, these are not produced
   * by someone doing something — they are produced by time passing, so they
   * have no actor and the scheduler emits them with `actorUserId: null`.
   */
  'APPOINTMENT_REMINDER',
  'QUOTATION_FOLLOW_UP',

  // Clients.
  'CLIENT_ASSIGNED',

  // Forms — the public link was filled. No actor (the filler has no
  // account), same as the two scheduled types above.
  'FORM_SUBMITTED',

  /*
   * Contracts. Both are scheduled types with no actor, like the two above —
   * a term approaching its end and a term reaching it are both time passing,
   * not anyone acting.
   */
  'CONTRACT_EXPIRING',
  'CONTRACT_EXPIRED',

  // Team.
  'INVITATION_ACCEPTED',

  // Offers — a discount above the cap (M2 Slice 10, FR-DSC-05, 07, 12).
  'DISCOUNT_APPROVAL_REQUESTED',
  'DISCOUNT_APPROVED',
  'DISCOUNT_REJECTED',
  'DISCOUNT_APPROVAL_REMINDER',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const isNotificationType = (value: string): value is NotificationType =>
  (NOTIFICATION_TYPES as readonly string[]).includes(value);

/** What a notification points at, so the UI can deep-link. */
export const NOTIFICATION_ENTITY_TYPES = [
  'QUOTATION',
  'APPOINTMENT',
  'CLIENT',
  'FORM',
  'CONTRACT',
  // M2 Slice 10: a discount approval points at its offer; the deal id travels
  // in params so the UI opens the deal page on that offer.
  'OFFER',
] as const;
export type NotificationEntityType = (typeof NOTIFICATION_ENTITY_TYPES)[number];

/**
 * Interpolation values for a type's i18n key.
 *
 * Entity labels are snapshots — the client name as it was when the event
 * happened, because that is what the notification is describing. People are
 * NOT in here: `actorUserId` is a column, resolved against the live staff list
 * at render time, so a colleague's name reads as it is now.
 */
export type NotificationParams = Record<string, string | number>;
