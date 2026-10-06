import { RecordScope } from '../../../../access/domain/RecordScope';
import { CalendarItem, CalendarKind, ContractCalendarItem, ContractCalendarKind } from '../calendarViews';

export interface CalendarFilters {
  userIds?: string[];
  kinds?: CalendarKind[];
  types?: string[];
}

/**
 * Reads of the calendar. Every method takes `tenantId` first and a
 * `RecordScope` on the salesperson, so the scope is a WHERE clause
 * (FR-RBAC-13), and each is one indexed query that joins the names it needs.
 */
export interface ICalendarStore {
  /** Open and completed items starting in `[from, to)`, earliest first. */
  inRange(tenantId: string, scope: RecordScope, filters: CalendarFilters, from: Date, to: Date, limit: number): Promise<Omit<CalendarItem, 'isOverdue'>[]>;
  /** Open items that started before `before`, earliest first. */
  openBefore(tenantId: string, scope: RecordScope, filters: CalendarFilters, before: Date, limit: number): Promise<Omit<CalendarItem, 'isOverdue'>[]>;
  /**
   * The end dates and renewal dates of Active, Suspended and Expired contracts
   * whose company is in `scope`, on the days `[fromDay, toDay)` (`YYYY-MM-DD`
   * workspace days). `userIds` narrows to the responsible salesperson.
   */
  contractDates(
    tenantId: string,
    scope: RecordScope,
    filters: { userIds?: string[]; kinds: ContractCalendarKind[] },
    fromDay: string,
    toDay: string,
    limit: number
  ): Promise<ContractCalendarItem[]>;
}
