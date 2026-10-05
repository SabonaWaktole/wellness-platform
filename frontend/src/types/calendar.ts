/**
 * The sales calendar (M2 Slice 12). Mirrors the backend's CalendarItem and
 * CalendarFeed. Times are instants, formatted in the workspace's time zone
 * (FR-CAL-08); overdue is decided by the server when the feed is read.
 */
export const CALENDAR_KINDS = ['FOLLOW_UP', 'PLANNED'] as const;
export type CalendarKind = (typeof CALENDAR_KINDS)[number];

/**
 * The read-only items the contracts add (M3 Slice 11, FR-REN-11): the day a term
 * ends and the date a renewal should be agreed. They are not appointments: they
 * have no time and cannot be moved, completed or cancelled, and they open the contract.
 */
export const CONTRACT_CALENDAR_KINDS = ['CONTRACT_END', 'CONTRACT_RENEWAL'] as const;
export type ContractCalendarKind = (typeof CONTRACT_CALENDAR_KINDS)[number];

export interface ContractCalendarItem {
  /** `<contractId>:END` or `<contractId>:RENEWAL`. */
  id: string;
  kind: ContractCalendarKind;
  /** A calendar day, `YYYY-MM-DD`: the same day in every time zone. */
  date: string;
  contractId: string;
  number: string;
  contractStatus: string;
  clientId: string;
  companyName: string;
  assignedUserId: string | null;
  assignedUserName: string | null;
}

/** What a planned item can be (FR-CAL-02). A follow-up's type can also be an email. */
export const PLANNED_TYPES = ['CALL', 'VISIT', 'MEETING', 'ONLINE_MEETING'] as const;
export type PlannedType = (typeof PLANNED_TYPES)[number];
export const CALENDAR_TYPES = ['CALL', 'EMAIL', 'VISIT', 'MEETING', 'ONLINE_MEETING'] as const;
export type CalendarType = (typeof CALENDAR_TYPES)[number];

export type CalendarStatus = 'SCHEDULED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';

export interface CalendarItem {
  id: string;
  kind: CalendarKind;
  type: CalendarType;
  status: CalendarStatus;
  scheduledAt: string;
  endAt: string | null;
  place: string | null;
  notes: string | null;
  clientId: string;
  companyName: string;
  dealId: string | null;
  /** null: the default "<company> – <type>", see useDealText. */
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
  items: CalendarItem[];
  itemsTruncated: boolean;
  overdue: CalendarItem[];
  overdueTruncated: boolean;
  /** Contract end and renewal dates of the viewer's scope in the range (FR-REN-11). */
  contractItems: ContractCalendarItem[];
  contractItemsTruncated: boolean;
}

export interface CalendarFeedParams {
  from: string;
  to: string;
  userIds?: string[];
  kinds?: (CalendarKind | ContractCalendarKind)[];
  types?: CalendarType[];
}

/** What planning a meeting, visit, online meeting or call sends (FR-CAL-02). */
export interface PlanActivityInput {
  clientId: string;
  assignedUserId: string;
  scheduledAt: string;
  endAt?: string | null;
  type: PlannedType;
  dealId?: string | null;
  contactPersonId?: string | null;
  place?: string | null;
  notes?: string;
}
