import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { NotificationItem } from './useNotifications';
import { findPersonById, getStaffDisplayName, type DisplayablePerson } from '../utils/userUtils';
import { useDateFormat } from './useDateFormat';
import { useMoneyFormat } from './useMoneyFormat';

/** Params that are amounts (M2 Slice 10, FR-DSC-05, FR-PRC-09): stored as "49.40", shown in the workspace's currency. */
const MONEY_PARAMS = ['listPrice', 'requestedMonthlyPrice', 'approvedMonthlyPrice'] as const;

/**
 * Renders a stored notification into a sentence.
 *
 * This is where the two halves of the storage decision are reunited:
 *
 *  - **Entity labels come from `params`** — snapshots taken when the event
 *    happened. "Quotation A1B2C3 approved" keeps naming the quotation it was
 *    about.
 *  - **People come from the live staff list**, resolved through `actorUserId`.
 *    A colleague's name should read as it is now, not as it was months ago, and
 *    `getStaffDisplayName` is the same helper the client list and quotation
 *    detail use (TD-021).
 *  - **Dates are formatted here**, never stored formatted, so they follow the
 *    tenant's timezone and locale like every other date (TD-029).
 */
/**
 * Types whose NULL actor means "the client responded through their public
 * quotation link", not "the system" — see RespondToPublicQuotationUseCase.
 * Every other NULL-actor type (QUOTATION_EXPIRED, APPOINTMENT_REMINDER, …) is
 * genuinely unattended, so only these two get the client-facing fallback.
 */
const CLIENT_ORIGINATED_TYPES = new Set(['QUOTATION_ACCEPTED', 'QUOTATION_REJECTED']);

export const useNotificationText = (staff: DisplayablePerson[] | undefined) => {
  const { t } = useTranslation('notifications');
  const dates = useDateFormat();
  const money = useMoneyFormat();

  return useCallback(
    (notification: NotificationItem): string => {
      const actor = findPersonById(staff, notification.actorUserId);
      // Falls back to a neutral word rather than a blank or an id: an actor
      // may be a user who has since been removed from the staff projection.
      const actorName = notification.actorUserId
        ? getStaffDisplayName(actor)
        : CLIENT_ORIGINATED_TYPES.has(notification.type)
          ? t('actor.client')
          : t('actor.system');

      const params: Record<string, string | number> = { ...notification.params, actor: actorName };

      // The one param that is an instant rather than a label.
      if (typeof params.scheduledAt === 'string') {
        params.scheduledAt = dates.dateTime(params.scheduledAt);
      }

      for (const key of MONEY_PARAMS) {
        if (typeof params[key] === 'string') params[key] = money.format(Number(params[key]));
      }

      // An unknown type renders its key rather than throwing or showing an
      // empty row — a notification that arrived is evidence of something, and
      // silently dropping it would hide the fact that a catalogue entry is
      // missing. A manual-price approval reads its own sentence (`…_manual`,
      // FR-PRC-09) through i18next's context.
      return t(`type.${notification.type}`, {
        ...params,
        context: params.kind === 'MANUAL_PRICE' ? 'manual' : undefined,
        defaultValue: notification.type,
      });
    },
    [t, dates, money, staff]
  );
};
