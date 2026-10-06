import { AppointmentStatus } from '../../domain/enums/AppointmentStatus';

/** The items the calendar shows (FR-CAL-01): follow-ups and planned activities. */
export const CALENDAR_KINDS = ['FOLLOW_UP', 'PLANNED'] as const;
export type CalendarKind = (typeof CALENDAR_KINDS)[number];

/**
 * The read-only items the contracts add (M3 Slice 11, FR-REN-11): the day a
 * term ends and the date a renewal should be agreed. They are not appointments:
 * no time, no status of their own, and they cannot be moved or completed.
 */
export const CONTRACT_CALENDAR_KINDS = ['CONTRACT_END', 'CONTRACT_RENEWAL'] as const;
export type ContractCalendarKind = (typeof CONTRACT_CALENDAR_KINDS)[number];

/** A contract's end date or renewal date on the calendar. It opens the contract. */
export interface ContractCalendarItem {
  /** `<contractId>:END` or `<contractId>:RENEWAL`: unique within a feed. */
  id: string;
  kind: ContractCalendarKind;
  /** A calendar day, `YYYY-MM-DD`, not an instant: it is the same day in every time zone. */
  date: string;
  contractId: string;
  /** The contract number, or its Legacy reference. */
  number: string;
  contractStatus: string;
  clientId: string;
  companyName: string;
  /** The responsible salesperson: the contract's, else the company's. */
  assignedUserId: string | null;
  assignedUserName: string | null;
}

/**
 * One item of the calendar, as the day, week, month and agenda views and the
 * item panel show it. Times are ISO instants: each reader formats them in the
 * workspace's zone (FR-CAL-08). `isOverdue` is computed when the feed is read.
 */
export interface CalendarItem {
  id: string;
  kind: CalendarKind;
  type: string;
  status: AppointmentStatus;
  scheduledAt: string;
  endAt: string | null;
  place: string | null;
  notes: string | null;
  clientId: string;
  companyName: string;
  dealId: string | null;
  /** The deal's own title; NULL means the default "<company> – <type>", rendered in the reader's language. */
  dealTitle: string | null;
  dealType: string | null;
  contactPersonId: string | null;
  contactName: string | null;
  assignedUserId: string;
  assignedUserName: string;
  isOverdue: boolean;
}

export interface CalendarFeed {
  from: string;
  to: string;
  /** Items starting in `[from, to)`, earliest first. */
  items: CalendarItem[];
  /** True when there were more items in the range than one response carries. */
  itemsTruncated: boolean;
  /** Open items before `from` and before now, earliest first (FR-CAL-04). */
  overdue: CalendarItem[];
  overdueTruncated: boolean;
  /** Contract end and renewal dates of the viewer's scope in `[from, to)`, earliest first (FR-REN-11). */
  contractItems: ContractCalendarItem[];
  contractItemsTruncated: boolean;
}
