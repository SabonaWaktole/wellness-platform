import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { IAppointmentRepository } from '../../domain/repositories/IAppointmentRepository';
import { AppointmentStatus } from '../../domain/enums/AppointmentStatus';

export interface SearchAppointmentsFilters {
  clientId?: string;
  assignedUserId?: string;
  status?: AppointmentStatus;
}

export interface SearchAppointmentsDTO {
  tenantId: string;
  startDate: Date;
  endDate: Date;
  filters?: SearchAppointmentsFilters;
  access: AccessContext;
}

export class SearchAppointmentsUseCase {
  constructor(
    private readonly appointmentRepository: IAppointmentRepository,
    private readonly scopes: RecordScopeResolver
  ) {}

  /** The calendar within the viewer's `calendar.view` scope, filtered in the query (FR-RBAC-13). */
  async execute(dto: SearchAppointmentsDTO) {
    const scope = await this.scopes.resolve(dto.access, 'calendar.view');
    const appointments = await this.appointmentRepository.findByDateRange(
      dto.tenantId,
      dto.startDate,
      dto.endDate,
      { ...dto.filters, scope }
    );

    return appointments.map((appt) => ({
      id: appt.id,
      tenantId: appt.tenantId,
      clientId: appt.clientId,
      clientName: appt.clientName,
      clientEmail: appt.clientEmail,
      assignedUserId: appt.assignedUserId,
      staffName: appt.staffName,
      scheduledAt: appt.scheduledAt,
      status: appt.status,
      notes: appt.notes,
    }));
  }
}
