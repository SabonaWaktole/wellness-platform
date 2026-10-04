/**
 * The sales calendar (M2 Slice 12). Mirrors the backend's CalendarItem and
 * CalendarFeed. Times are instants, formatted in the workspace's time zone
 * (FR-CAL-08); overdue is decided by the server when the feed is read.
 */
export const CALENDAR_KINDS = ['FOLLOW_UP', 'PLANNED'] as const;
export type CalendarKind = (typeof CALENDAR_KINDS)[number];

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
}

export interface CalendarFeedParams {
  from: string;
  to: string;
  userIds?: string[];
  kinds?: CalendarKind[];
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
