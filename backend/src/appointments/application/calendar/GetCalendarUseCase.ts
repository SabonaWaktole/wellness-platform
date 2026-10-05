import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { AppointmentStatus } from '../../domain/enums/AppointmentStatus';
import { VIEW_CALENDAR } from '../followUps/followUpAccess';
import { dayKeyInZone } from '../../../shared/domain/time/tenantDay';
import { CalendarFeed, CalendarItem, CalendarKind, CONTRACT_CALENDAR_KINDS, ContractCalendarKind } from './calendarViews';
import { ICalendarStore } from './ports/ICalendarStore';

/** The longest range one request may ask for: a month view with its leading and trailing days, with room. */
export const CALENDAR_MAX_RANGE_DAYS = 62;
/** Bounds each list. A longer one is cut and says so (`itemsTruncated`, `overdueTruncated`): narrow it by salesperson, kind or type. */
export const CALENDAR_LIST_LIMIT = 2000;

export class InvalidCalendarRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCalendarRangeError';
  }
}

function atTime(item: Omit<CalendarItem, 'isOverdue'>, now: Date): CalendarItem {
  const open = item.status === AppointmentStatus.SCHEDULED || item.status === AppointmentStatus.CONFIRMED;
  return { ...item, isOverdue: open && new Date(item.scheduledAt).getTime() < now.getTime() };
}

/**
 * FR-CAL-01..05: the calendar feed. Items in the range and, apart from them,
 * the open items that are already overdue, so the day and agenda views can
 * list them on today's date. Everything is within the caller's `calendar.view`
 * scope: a Sales User's own, the Sales Manager's team, the CEO's everyone.
 */
export class GetCalendarUseCase {
  constructor(
    private readonly store: ICalendarStore,
    private readonly scopes: RecordScopeResolver,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: {
    access: AccessContext;
    tenantId: string;
    from: Date;
    to: Date;
    userIds?: string[];
    /** Appointment kinds and the contract kinds, mixed as the caller sent them. */
    kinds?: (CalendarKind | ContractCalendarKind)[];
    types?: string[];
    /** The workspace's time zone: a contract date is shown on the workspace day the range covers. */
    timezone?: string;
  }): Promise<CalendarFeed> {
    input.access.ensure(VIEW_CALENDAR);
    if (Number.isNaN(input.from.getTime()) || Number.isNaN(input.to.getTime()) || input.to <= input.from) {
      throw new InvalidCalendarRangeError('The end of the range must be after its start.');
    }
    if (input.to.getTime() - input.from.getTime() > CALENDAR_MAX_RANGE_DAYS * 24 * 60 * 60 * 1000) {
      throw new InvalidCalendarRangeError(`Ask for at most ${CALENDAR_MAX_RANGE_DAYS} days at a time.`);
    }

    const now = this.now();
    const scope = await this.scopes.resolve(input.access, VIEW_CALENDAR);

    // The kinds filter names appointment kinds and contract kinds together. Nothing named of a group means all of it,
    // unless the other group was named: asking for contract end dates alone is not a request for the appointments.
    const appointmentKinds = (input.kinds ?? []).filter((kind): kind is CalendarKind => !(CONTRACT_CALENDAR_KINDS as readonly string[]).includes(kind));
    const contractKinds = (input.kinds ?? []).filter((kind): kind is ContractCalendarKind => (CONTRACT_CALENDAR_KINDS as readonly string[]).includes(kind));
    const wantAppointments = !input.kinds?.length || appointmentKinds.length > 0;
    // A type (call, visit, ...) belongs to an activity, so asking for types asks for activities only.
    const wantContracts = !input.types?.length && (!input.kinds?.length || contractKinds.length > 0) && input.access.can('contracts.validity.view');

    const filters = { userIds: input.userIds, kinds: appointmentKinds, types: input.types };
    // Overdue is what is open and behind both the range and now.
    const overdueBefore = input.from.getTime() < now.getTime() ? input.from : now;

    const timezone = input.timezone ?? 'UTC';
    // One more than the limit, to know whether there is more.
    const [items, overdue, contractItems] = await Promise.all([
      wantAppointments ? this.store.inRange(input.tenantId, scope, filters, input.from, input.to, CALENDAR_LIST_LIMIT + 1) : [],
      wantAppointments ? this.store.openBefore(input.tenantId, scope, filters, overdueBefore, CALENDAR_LIST_LIMIT + 1) : [],
      wantContracts
        ? this.contractItems(input, timezone, contractKinds.length ? contractKinds : [...CONTRACT_CALENDAR_KINDS])
        : [],
    ]);
    return {
      from: input.from.toISOString(),
      to: input.to.toISOString(),
      items: items.slice(0, CALENDAR_LIST_LIMIT).map((item) => atTime(item, now)),
      itemsTruncated: items.length > CALENDAR_LIST_LIMIT,
      overdue: overdue.slice(0, CALENDAR_LIST_LIMIT).map((item) => atTime(item, now)),
      overdueTruncated: overdue.length > CALENDAR_LIST_LIMIT,
      contractItems: contractItems.slice(0, CALENDAR_LIST_LIMIT),
      contractItemsTruncated: contractItems.length > CALENDAR_LIST_LIMIT,
    };
  }

  /**
   * The contract end and renewal dates (FR-REN-11), read at the viewer's contract
   * scope: a Sales User's own companies, the Sales Manager's team, All for the CEO.
   * The range is read as the workspace days it covers.
   */
  private async contractItems(
    input: { access: AccessContext; tenantId: string; from: Date; to: Date; userIds?: string[] },
    timezone: string,
    kinds: ContractCalendarKind[]
  ) {
    const scope = await this.scopes.resolve(input.access, 'contracts.validity.view');
    // `to` is exclusive: a range ending at midnight stops before that day.
    const toExclusive = new Date(input.to.getTime() - 1);
    const lastDay = dayKeyInZone(toExclusive, timezone);
    const nextDay = new Date(new Date(`${lastDay}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return this.store.contractDates(
      input.tenantId,
      scope,
      { userIds: input.userIds, kinds },
      dayKeyInZone(input.from, timezone),
      nextDay,
      CALENDAR_LIST_LIMIT + 1
    );
  }
}
