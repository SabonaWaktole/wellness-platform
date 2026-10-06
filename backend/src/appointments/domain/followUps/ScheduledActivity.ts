import { AppointmentStatus } from '../enums/AppointmentStatus';
import { FollowUpClosedError, InvalidFollowUpError } from './errors';

/**
 * Plan D1: one scheduled-activity entity on the Appointment table. A
 * follow-up (Slice 11) or a planned meeting, visit, online meeting or call
 * (Slice 12). Every appointment made before Milestone 2 is a PLANNED meeting.
 */
export enum ScheduledActivityKind {
  FollowUp = 'FOLLOW_UP',
  Planned = 'PLANNED',
}

/** The type of contact: the activity types of Slice 7, without the note. */
export const SCHEDULED_ACTIVITY_TYPES = ['CALL', 'EMAIL', 'VISIT', 'MEETING', 'ONLINE_MEETING'] as const;
export type ScheduledActivityType = (typeof SCHEDULED_ACTIVITY_TYPES)[number];

export function isScheduledActivityType(value: string): value is ScheduledActivityType {
  return (SCHEDULED_ACTIVITY_TYPES as readonly string[]).includes(value);
}

const NOTE_MAX = 500;
const REASON_MAX = 500;
/** How far behind the server a due time may be: the sender's clock, not the past. */
const CLOCK_SKEW_MS = 60 * 1000;

const OPEN_STATUSES: readonly AppointmentStatus[] = [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED];

/** One reschedule, kept in AppointmentAuditLog (FR-FUP-06). */
export interface RescheduleEntry {
  previousDate: Date;
  newDate: Date;
  reason: string;
  changedBy: string;
  createdAt: Date;
}

export interface ScheduledActivityProps {
  id: string;
  tenantId: string;
  clientId: string;
  assignedUserId: string;
  kind: ScheduledActivityKind;
  type: ScheduledActivityType;
  status: AppointmentStatus;
  /** The due time of a follow-up, the start of a planned activity. */
  scheduledAt: Date;
  endAt: Date | null;
  place: string | null;
  dealId: string | null;
  contactPersonId: string | null;
  notes: string | null;
  intervalDays: number | null;
  completedInteractionId: string | null;
  cancelReason: string | null;
  dueNotifiedAt: Date | null;
  /** When the follow-up was completed (FR-PRF-05). NULL while it is open. */
  completedAt: Date | null;
  history: RescheduleEntry[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ScheduleFollowUpInput {
  id: string;
  tenantId: string;
  clientId: string;
  dealId: string | null;
  contactPersonId: string | null;
  assignedUserId: string;
  type: ScheduledActivityType;
  dueAt: Date;
  /** The "+N days" button it came from, or null for a custom date. */
  intervalDays: number | null;
  note: string | null;
}

/**
 * A follow-up and the rules for closing it (FR-FUP-02, 05, 06, 10). Overdue
 * is derived from the due time, never stored, so it cannot go stale (D1).
 */
export class ScheduledActivity {
  private constructor(private props: ScheduledActivityProps) {}

  static scheduleFollowUp(input: ScheduleFollowUpInput, now: Date): ScheduledActivity {
    if (!isScheduledActivityType(input.type)) {
      throw new InvalidFollowUpError('type', 'Choose a call, email, visit, meeting or online meeting.');
    }
    assertNotPast(input.dueAt, now);
    return new ScheduledActivity({
      id: input.id,
      tenantId: input.tenantId,
      clientId: input.clientId,
      assignedUserId: input.assignedUserId,
      kind: ScheduledActivityKind.FollowUp,
      type: input.type,
      status: AppointmentStatus.SCHEDULED,
      scheduledAt: input.dueAt,
      endAt: null,
      place: null,
      dealId: input.dealId,
      contactPersonId: input.contactPersonId,
      notes: cleanNote(input.note),
      intervalDays: input.intervalDays,
      completedInteractionId: null,
      cancelReason: null,
      dueNotifiedAt: null,
      completedAt: null,
      history: [],
      createdAt: now,
      updatedAt: now,
    });
  }

  /** As stored. No validation: what is stored was valid when written. */
  static rebuild(props: ScheduledActivityProps): ScheduledActivity {
    return new ScheduledActivity({ ...props, history: [...props.history] });
  }

  get id(): string {
    return this.props.id;
  }
  get tenantId(): string {
    return this.props.tenantId;
  }
  get clientId(): string {
    return this.props.clientId;
  }
  get dealId(): string | null {
    return this.props.dealId;
  }
  get assignedUserId(): string {
    return this.props.assignedUserId;
  }
  get kind(): ScheduledActivityKind {
    return this.props.kind;
  }
  get type(): ScheduledActivityType {
    return this.props.type;
  }
  get status(): AppointmentStatus {
    return this.props.status;
  }
  get scheduledAt(): Date {
    return this.props.scheduledAt;
  }
  get completedInteractionId(): string | null {
    return this.props.completedInteractionId;
  }
  get history(): RescheduleEntry[] {
    return [...this.props.history];
  }
  get isOpen(): boolean {
    return OPEN_STATUSES.includes(this.props.status);
  }

  /** FR-FUP-05: open and past its due time, until completed, rescheduled or cancelled. */
  isOverdue(now: Date): boolean {
    return this.isOpen && this.props.scheduledAt.getTime() < now.getTime();
  }

  /** FR-FUP-06: closed by the activity that happened, and linked to it. */
  complete(interactionId: string, now: Date): void {
    this.assertOpen();
    this.props.status = AppointmentStatus.COMPLETED;
    this.props.completedInteractionId = interactionId;
    this.props.completedAt = now;
    this.props.updatedAt = now;
  }

  /**
   * FR-FUP-06: a new due time, with the previous one kept in the history. The
   * due notification is re-armed, since it described a time that has moved.
   */
  reschedule(newAt: Date, reason: string | null, byUserId: string, now: Date): void {
    this.assertOpen();
    assertNotPast(newAt, now);
    const cleaned = reason?.trim() ?? '';
    if (cleaned.length > REASON_MAX) {
      throw new InvalidFollowUpError('reason', `The reason can be at most ${REASON_MAX} characters.`);
    }
    this.props.history.push({ previousDate: this.props.scheduledAt, newDate: newAt, reason: cleaned, changedBy: byUserId, createdAt: now });
    this.props.scheduledAt = newAt;
    this.props.dueNotifiedAt = null;
    this.props.updatedAt = now;
  }

  /** FR-FUP-06: cancelled with a reason, which is kept. */
  cancel(reason: string, now: Date): void {
    this.assertOpen();
    const cleaned = reason?.trim() ?? '';
    if (!cleaned) throw new InvalidFollowUpError('reason', 'Give a reason for cancelling.');
    if (cleaned.length > REASON_MAX) {
      throw new InvalidFollowUpError('reason', `The reason can be at most ${REASON_MAX} characters.`);
    }
    this.props.status = AppointmentStatus.CANCELLED;
    this.props.cancelReason = cleaned;
    this.props.updatedAt = now;
  }

  /** FR-FUP-10: hands it to another salesperson. Returns the previous one. */
  reassign(assignedUserId: string, now: Date): string {
    this.assertOpen();
    const previous = this.props.assignedUserId;
    this.props.assignedUserId = assignedUserId;
    this.props.updatedAt = now;
    return previous;
  }

  toProps(): ScheduledActivityProps {
    return { ...this.props, history: [...this.props.history] };
  }

  private assertOpen(): void {
    if (!this.isOpen) throw new FollowUpClosedError();
  }
}

function assertNotPast(at: Date, now: Date): void {
  if (Number.isNaN(at.getTime())) {
    throw new InvalidFollowUpError('dueAt', 'Choose a valid date and time.');
  }
  if (at.getTime() < now.getTime() - CLOCK_SKEW_MS) {
    throw new InvalidFollowUpError('dueAt', 'A follow-up cannot be due in the past.');
  }
}

function cleanNote(note: string | null | undefined): string | null {
  const trimmed = note?.trim() ?? '';
  if (trimmed.length > NOTE_MAX) {
    throw new InvalidFollowUpError('note', `The note can be at most ${NOTE_MAX} characters.`);
  }
  return trimmed || null;
}
