import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { AppointmentStatus } from '../../domain/enums/AppointmentStatus';
import { VIEW_CALENDAR } from '../followUps/followUpAccess';
import { CalendarFeed, CalendarItem, CalendarKind } from './calendarViews';
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
    kinds?: CalendarKind[];
    types?: string[];
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
    const filters = { userIds: input.userIds, kinds: input.kinds, types: input.types };
    // Overdue is what is open and behind both the range and now.
    const overdueBefore = input.from.getTime() < now.getTime() ? input.from : now;

    // One more than the limit, to know whether there is more.
    const [items, overdue] = await Promise.all([
      this.store.inRange(input.tenantId, scope, filters, input.from, input.to, CALENDAR_LIST_LIMIT + 1),
      this.store.openBefore(input.tenantId, scope, filters, overdueBefore, CALENDAR_LIST_LIMIT + 1),
    ]);
    return {
      from: input.from.toISOString(),
      to: input.to.toISOString(),
      items: items.slice(0, CALENDAR_LIST_LIMIT).map((item) => atTime(item, now)),
      itemsTruncated: items.length > CALENDAR_LIST_LIMIT,
      overdue: overdue.slice(0, CALENDAR_LIST_LIMIT).map((item) => atTime(item, now)),
      overdueTruncated: overdue.length > CALENDAR_LIST_LIMIT,
    };
  }
}
