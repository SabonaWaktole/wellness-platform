import { AppointmentStatus } from '../../domain/enums/AppointmentStatus';
import { ScheduledActivityType } from '../../domain/followUps/ScheduledActivity';

/** One reschedule, as the API sends it (FR-FUP-06). */
export interface FollowUpHistoryView {
  previousDate: string;
  newDate: string;
  reason: string;
  changedByUserId: string;
  at: string;
}

/**
 * A follow-up as "My follow-ups", the team view, the deal page and the
 * company page show it. `isOverdue` is computed when it is read (FR-FUP-05).
 */
export interface FollowUpView {
  id: string;
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
  type: ScheduledActivityType;
  status: AppointmentStatus;
  scheduledAt: string;
  notes: string | null;
  intervalDays: number | null;
  completedInteractionId: string | null;
  cancelReason: string | null;
  isOverdue: boolean;
  history: FollowUpHistoryView[];
  createdAt: string;
  updatedAt: string;
}

/** FR-FUP-07: grouped in the workspace's time zone. */
export interface FollowUpGroups {
  overdue: FollowUpView[];
  today: FollowUpView[];
  upcoming: FollowUpView[];
}

/** A view whose `isOverdue` is decided at `now`. */
export function atTime<T extends Omit<FollowUpView, 'isOverdue'>>(view: T, now: Date): T & { isOverdue: boolean } {
  const open = view.status === AppointmentStatus.SCHEDULED || view.status === AppointmentStatus.CONFIRMED;
  return { ...view, isOverdue: open && new Date(view.scheduledAt).getTime() < now.getTime() };
}
