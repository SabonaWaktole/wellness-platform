import { AppointmentStatus } from '../enums/AppointmentStatus';
import { DomainError } from '../../../shared/domain/errors/DomainError';

/** M2 Slice 12 (FR-CAL-02): what a planned item can be. An email is a follow-up's type, not a slot in the day. */
export const PLANNED_ACTIVITY_TYPES = ['CALL', 'VISIT', 'MEETING', 'ONLINE_MEETING'] as const;
export type PlannedActivityType = (typeof PLANNED_ACTIVITY_TYPES)[number];

const PLACE_MAX = 200;

export interface RescheduleLog {
  id?: string;
  previousDate: Date;
  newDate: Date;
  reason: string;
  changedBy: string; // userId
  createdAt?: Date;
}

export interface AppointmentProps {
  id: string;
  tenantId: string;
  clientId: string;
  assignedUserId: string;
  scheduledAt: Date;
  status?: AppointmentStatus;
  /** M2 Slice 11 (plan D1): FOLLOW_UP or PLANNED. Written by the follow-up use cases only; read here for access. */
  kind?: string;
  /** CALL, VISIT, MEETING or ONLINE_MEETING for a planned item (FR-CAL-02). Existing rows are meetings. */
  type?: string;
  dealId?: string | null;
  contactPersonId?: string | null;
  /** The end of a planned item; NULL for one with no set length. */
  endAt?: Date | null;
  /** Where a visit takes place. */
  place?: string | null;
  notes?: string;
  history?: RescheduleLog[];
  createdAt?: Date;
  updatedAt?: Date;

  // Validation props (not persisted directly to this entity)
  clientTenantId?: string;
  assignedUserTenantId?: string;

  // Read-only display fields hydrated from joined Client/User records.
  // Not persisted on this entity and never written back to the DB.
  clientName?: string;
  clientEmail?: string;
  staffName?: string;
  /** The deal's own title (NULL: the default "<company> – <type>"), its type, and the contact's name. */
  dealTitle?: string | null;
  dealType?: string | null;
  contactName?: string | null;
}

export class Appointment {
  private _id: string;
  private _tenantId: string;
  private _clientId: string;
  private _assignedUserId: string;
  private _scheduledAt: Date;
  private _status: AppointmentStatus;
  private _kind: string;
  private _type: string;
  private _dealId: string | null;
  private _contactPersonId: string | null;
  private _endAt: Date | null;
  private _place: string | null;
  private _notes?: string;
  private _history: RescheduleLog[];
  private _createdAt: Date;
  private _updatedAt: Date;
  private _clientName?: string;
  private _clientEmail?: string;
  private _staffName?: string;
  private _dealTitle: string | null;
  private _dealType: string | null;
  private _contactName: string | null;

  private constructor(props: AppointmentProps) {
    this._id = props.id;
    this._tenantId = props.tenantId;
    this._clientId = props.clientId;
    this._assignedUserId = props.assignedUserId;
    this._scheduledAt = props.scheduledAt;
    this._status = props.status ?? AppointmentStatus.SCHEDULED;
    this._kind = props.kind ?? 'PLANNED';
    this._type = props.type ?? 'MEETING';
    this._dealId = props.dealId ?? null;
    this._contactPersonId = props.contactPersonId ?? null;
    this._endAt = props.endAt ?? null;
    this._place = props.place ?? null;
    this._notes = props.notes;
    this._history = props.history ?? [];
    this._createdAt = props.createdAt ?? new Date();
    this._updatedAt = props.updatedAt ?? new Date();
    this._clientName = props.clientName;
    this._clientEmail = props.clientEmail;
    this._staffName = props.staffName;
    this._dealTitle = props.dealTitle ?? null;
    this._dealType = props.dealType ?? null;
    this._contactName = props.contactName ?? null;
  }

  static create(props: AppointmentProps): Appointment {
    if (props.clientTenantId && props.clientTenantId !== props.tenantId) {
      throw new DomainError('Client does not belong to this tenant');
    }
    if (props.assignedUserTenantId && props.assignedUserTenantId !== props.tenantId) {
      throw new DomainError('Assigned user does not belong to this tenant');
    }

    return new Appointment(props);
  }

  /**
   * A new planned item (FR-CAL-02), checked on the way in. `create` also
   * rebuilds stored rows, which were valid when written and, for a follow-up,
   * keep the rules of `ScheduledActivity`.
   */
  static plan(props: AppointmentProps): Appointment {
    assertPlanned({ type: props.type ?? 'MEETING', scheduledAt: props.scheduledAt, endAt: props.endAt ?? null, place: props.place ?? null });
    return Appointment.create({ ...props, kind: 'PLANNED' });
  }

  get id(): string { return this._id; }
  get tenantId(): string { return this._tenantId; }
  get clientId(): string { return this._clientId; }
  get assignedUserId(): string { return this._assignedUserId; }
  get scheduledAt(): Date { return this._scheduledAt; }
  get status(): AppointmentStatus { return this._status; }
  get kind(): string { return this._kind; }
  get type(): string { return this._type; }
  get dealId(): string | null { return this._dealId; }
  get contactPersonId(): string | null { return this._contactPersonId; }
  get endAt(): Date | null { return this._endAt; }
  get place(): string | null { return this._place; }
  get notes(): string | undefined { return this._notes; }
  get history(): RescheduleLog[] { return [...this._history]; }
  get createdAt(): Date { return this._createdAt; }
  get updatedAt(): Date { return this._updatedAt; }
  get clientName(): string | undefined { return this._clientName; }
  get clientEmail(): string | undefined { return this._clientEmail; }
  get staffName(): string | undefined { return this._staffName; }
  get dealTitle(): string | null { return this._dealTitle; }
  get dealType(): string | null { return this._dealType; }
  get contactName(): string | null { return this._contactName; }

  confirm(): void {
    this.assertNotTerminal();
    this._status = AppointmentStatus.CONFIRMED;
    this.markUpdated();
  }

  /**
   * `undefined` leaves a field as it is; `null` clears a deal, contact, end or
   * place. A new company clears the deal and contact it replaces unless new
   * ones are given (the caller checks they belong to it).
   */
  updateDetails(props: {
    clientId?: string;
    assignedUserId?: string;
    scheduledAt?: Date;
    notes?: string;
    type?: string;
    dealId?: string | null;
    contactPersonId?: string | null;
    endAt?: Date | null;
    place?: string | null;
  }): void {
    this.assertNotTerminal();
    const next = {
      type: props.type ?? this._type,
      scheduledAt: props.scheduledAt ?? this._scheduledAt,
      endAt: props.endAt === undefined ? this._endAt : props.endAt,
      place: props.place === undefined ? this._place : props.place,
    };
    // Moving the start without the end keeps the length (FR-CAL-07).
    if (props.scheduledAt && props.endAt === undefined && this._endAt) {
      next.endAt = new Date(props.scheduledAt.getTime() + (this._endAt.getTime() - this._scheduledAt.getTime()));
    }
    if (this._kind === 'PLANNED') assertPlanned(next);

    if (props.clientId && props.clientId !== this._clientId) {
      this._clientId = props.clientId;
      this._dealId = null;
      this._contactPersonId = null;
    }
    if (props.assignedUserId) this._assignedUserId = props.assignedUserId;
    this._scheduledAt = next.scheduledAt;
    this._endAt = next.endAt;
    this._type = next.type;
    this._place = next.place;
    if (props.dealId !== undefined) this._dealId = props.dealId;
    if (props.contactPersonId !== undefined) this._contactPersonId = props.contactPersonId;
    if (props.notes !== undefined) this._notes = props.notes;
    this.markUpdated();
  }

  complete(): void {
    this.assertNotTerminal();
    if (this._status !== AppointmentStatus.CONFIRMED) {
      throw new DomainError('Cannot complete an unconfirmed appointment');
    }
    this._status = AppointmentStatus.COMPLETED;
    this.markUpdated();
  }

  cancel(reason: string, changedBy: string): void {
    this.assertNotTerminal();
    this._status = AppointmentStatus.CANCELLED;
    // We could log the reason for cancellation if needed, but per requirements we just mark as cancelled.
    this.markUpdated();
  }

  /**
   * FR-CAL-07: a new start. The end moves with it, so the item keeps its
   * length, unless a new end is given.
   */
  reschedule(newDate: Date, reason: string, changedBy: string, newEnd?: Date): void {
    this.assertNotTerminal();
    const end = newEnd ?? (this._endAt ? new Date(newDate.getTime() + (this._endAt.getTime() - this._scheduledAt.getTime())) : null);
    if (end && end.getTime() <= newDate.getTime()) {
      throw new DomainError('The end must be after the start.');
    }

    this._history.push({
      previousDate: this._scheduledAt,
      newDate: newDate,
      reason,
      changedBy,
      createdAt: new Date(),
    });

    this._scheduledAt = newDate;
    this._endAt = end;
    this.markUpdated();
  }

  private assertNotTerminal(): void {
    if (this._status === AppointmentStatus.COMPLETED || this._status === AppointmentStatus.CANCELLED) {
      throw new DomainError(`Appointment is in terminal state: ${this._status}`);
    }
  }

  private markUpdated(): void {
    this._updatedAt = new Date();
  }
}

function assertPlanned(item: { type: string; scheduledAt: Date; endAt: Date | null; place: string | null }): void {
  if (!(PLANNED_ACTIVITY_TYPES as readonly string[]).includes(item.type)) {
    throw new DomainError('Choose a call, visit, meeting or online meeting.');
  }
  if (item.endAt && item.endAt.getTime() <= item.scheduledAt.getTime()) {
    throw new DomainError('The end must be after the start.');
  }
  const place = item.place?.trim() ?? '';
  if (place && item.type !== 'VISIT') {
    throw new DomainError('A place applies to visits only.');
  }
  if (place.length > PLACE_MAX) {
    throw new DomainError(`The place can be at most ${PLACE_MAX} characters.`);
  }
}
