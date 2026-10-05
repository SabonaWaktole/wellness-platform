import { AccessContext } from '../../access/domain/AccessContext';
import { daysBetween } from '../domain/calendarDay';
import { RenewalListing } from './use-cases/SearchRenewalsUseCase';

const dayKey = (value: Date) => value.toISOString().slice(0, 10);

/**
 * One row of the Renewals screen, for one viewer (FR-RBAC-06, FR-RBAC-21):
 *
 *   - Everyone who may read contracts gets the validity facts: number, status,
 *     company, start, end and the days remaining. That alone is Reception's view.
 *   - With `contracts.manage` or `commercial.view`: the responsible salesperson,
 *     the renewal state and the link to the renewed contract, and the actions
 *     (the Sales User, the Sales Manager, the Administrator, the CEO).
 *   - With `commercial.view`: the plan and monthly price, the open deal's id and
 *     the Not renewing reason and note. They are removed from the response, not
 *     hidden by the screen.
 *
 * Dates are calendar days (`YYYY-MM-DD`), never instants.
 */
export function presentRenewalRow({ row, actions }: RenewalListing, access: AccessContext, today: Date) {
  const view: Record<string, unknown> = {
    contractId: row.contractId,
    number: row.number,
    status: row.status,
    company: row.client,
    startsAt: dayKey(row.startsAt),
    endsAt: dayKey(row.endsAt),
    daysRemaining: daysBetween(today, row.endsAt),
  };

  if (access.can('contracts.manage') || access.can('commercial.view')) {
    view.salesperson = row.salesperson;
    view.state = row.state;
    view.renewedInto = row.renewedInto;
    view.actions = actions;
  }
  if (access.can('commercial.view')) {
    view.planName = row.planName;
    view.monthlyPrice = row.monthlyPrice.toString();
    view.openDealId = row.openDealId;
    view.notRenewing = row.notRenewing;
  }
  return view;
}
