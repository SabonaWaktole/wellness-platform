import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { IAppointmentRepository } from '../../domain/repositories/IAppointmentRepository';

export interface GetUpcomingAppointmentsDTO {
  tenantId: string;
  access: AccessContext;
  limit?: number;
}

export class GetUpcomingAppointmentsUseCase {
  constructor(
    private readonly appointmentRepository: IAppointmentRepository,
    private readonly scopes: RecordScopeResolver
  ) {}

  /** Upcoming appointments within the viewer's `calendar.view` scope (FR-RBAC-11..13). */
  async execute(dto: GetUpcomingAppointmentsDTO) {
    const scope = await this.scopes.resolve(dto.access, 'calendar.view');
    const limit = dto.limit ?? 5;

    const appointments = await this.appointmentRepository.findUpcoming(dto.tenantId, scope, limit);

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
