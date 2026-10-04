/**
 * Follow-ups (M2 Slice 11). Mirrors the backend's FollowUpView. A follow-up's
 * due time is an instant, formatted in the workspace's time zone; overdue is
 * decided by the server when it is read (FR-FUP-05).
 */
export const FOLLOW_UP_TYPES = ['CALL', 'EMAIL', 'VISIT', 'MEETING', 'ONLINE_MEETING'] as const;
export type FollowUpType = (typeof FOLLOW_UP_TYPES)[number];

export type FollowUpStatus = 'SCHEDULED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';

export interface FollowUpHistoryEntry {
  previousDate: string;
  newDate: string;
  reason: string;
  changedByUserId: string;
  at: string;
}

export interface FollowUp {
  id: string;
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
  type: FollowUpType;
  status: FollowUpStatus;
  scheduledAt: string;
  notes: string | null;
  intervalDays: number | null;
  completedInteractionId: string | null;
  cancelReason: string | null;
  isOverdue: boolean;
  history: FollowUpHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

/** FR-FUP-07: "My follow-ups", grouped in the workspace's time zone. */
export interface FollowUpGroups {
  overdue: FollowUp[];
  today: FollowUp[];
  upcoming: FollowUp[];
}

export interface ScheduleFollowUpInput {
  clientId: string;
  dealId?: string | null;
  contactPersonId?: string | null;
  /** The activity just saved (FR-ACT-04): its deal, contact and next action are the defaults. */
  fromActivityId?: string | null;
  type?: FollowUpType;
  /** A "+N days" button; or `dueDate` for "Custom date". */
  intervalDays?: number | null;
  /** `YYYY-MM-DD`, read in the workspace's time zone. */
  dueDate?: string | null;
  /** `HH:mm`, default 09:00. */
  time?: string | null;
  /** Leave out to take the activity's next action. */
  note?: string | null;
  assignedUserId?: string | null;
}

export interface RescheduleFollowUpInput {
  intervalDays?: number | null;
  dueDate?: string | null;
  time?: string | null;
  reason?: string | null;
}

export interface FollowUpListParams {
  assignedUserId?: string;
  dealId?: string;
  clientId?: string;
  overdueOnly?: boolean;
}
