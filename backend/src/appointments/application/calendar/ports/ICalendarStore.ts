import { RecordScope } from '../../../../access/domain/RecordScope';
import { CalendarItem, CalendarKind } from '../calendarViews';

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
}
