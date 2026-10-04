import { AppointmentStatus } from '../enums/AppointmentStatus';
import { DomainError } from '../../../shared/domain/errors/DomainError';

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
}

export class Appointment {
  private _id: string;
  private _tenantId: string;
  private _clientId: string;
  private _assignedUserId: string;
  private _scheduledAt: Date;
  private _status: AppointmentStatus;
  private _kind: string;
  private _notes?: string;
  private _history: RescheduleLog[];
  private _createdAt: Date;
  private _updatedAt: Date;
  private _clientName?: string;
  private _clientEmail?: string;
  private _staffName?: string;

  private constructor(props: AppointmentProps) {
    this._id = props.id;
    this._tenantId = props.tenantId;
    this._clientId = props.clientId;
    this._assignedUserId = props.assignedUserId;
    this._scheduledAt = props.scheduledAt;
    this._status = props.status ?? AppointmentStatus.SCHEDULED;
    this._kind = props.kind ?? 'PLANNED';
    this._notes = props.notes;
    this._history = props.history ?? [];
    this._createdAt = props.createdAt ?? new Date();
    this._updatedAt = props.updatedAt ?? new Date();
    this._clientName = props.clientName;
    this._clientEmail = props.clientEmail;
    this._staffName = props.staffName;
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

  get id(): string { return this._id; }
  get tenantId(): string { return this._tenantId; }
  get clientId(): string { return this._clientId; }
  get assignedUserId(): string { return this._assignedUserId; }
  get scheduledAt(): Date { return this._scheduledAt; }
  get status(): AppointmentStatus { return this._status; }
  get kind(): string { return this._kind; }
  get notes(): string | undefined { return this._notes; }
  get history(): RescheduleLog[] { return [...this._history]; }
  get createdAt(): Date { return this._createdAt; }
  get updatedAt(): Date { return this._updatedAt; }
  get clientName(): string | undefined { return this._clientName; }
  get clientEmail(): string | undefined { return this._clientEmail; }
  get staffName(): string | undefined { return this._staffName; }

  confirm(): void {
    this.assertNotTerminal();
    this._status = AppointmentStatus.CONFIRMED;
    this.markUpdated();
  }

  updateDetails(props: { clientId?: string; assignedUserId?: string; scheduledAt?: Date; notes?: string }): void {
    this.assertNotTerminal();
    if (props.clientId) this._clientId = props.clientId;
    if (props.assignedUserId) this._assignedUserId = props.assignedUserId;
    if (props.scheduledAt) this._scheduledAt = props.scheduledAt;
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

  reschedule(newDate: Date, reason: string, changedBy: string): void {
    this.assertNotTerminal();
    
    this._history.push({
      previousDate: this._scheduledAt,
      newDate: newDate,
      reason,
      changedBy,
      createdAt: new Date(),
    });

    this._scheduledAt = newDate;
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
