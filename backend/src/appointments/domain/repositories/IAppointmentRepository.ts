import { RecordScope } from '../../../access/domain/RecordScope';
import { Appointment } from '../entities/Appointment';
import { AppointmentStatus } from '../enums/AppointmentStatus';

export interface SearchAppointmentsFilters {
  clientId?: string;
  assignedUserId?: string;
  status?: AppointmentStatus;
  /** The viewer's `calendar.view` reach over the appointment's assignee (FR-RBAC-11..13). */
  scope?: RecordScope;
}

export interface IAppointmentRepository {
  findById(id: string, tenantId: string): Promise<Appointment | null>;
  findByClientId(clientId: string, tenantId: string): Promise<Appointment[]>;
  findByDateRange(tenantId: string, startDate: Date, endDate: Date, filters?: SearchAppointmentsFilters): Promise<Appointment[]>;
  findUpcoming(tenantId: string, scope?: RecordScope, limit?: number): Promise<Appointment[]>;
  findRecentByTenant(tenantId: string, limit: number, scope?: RecordScope): Promise<Appointment[]>;
  save(appointment: Appointment): Promise<void>;
  update(appointment: Appointment): Promise<void>;
}
