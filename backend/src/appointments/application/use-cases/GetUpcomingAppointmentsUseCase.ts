import { IAppointmentRepository } from '../../domain/repositories/IAppointmentRepository';

export interface GetUpcomingAppointmentsDTO {
  tenantId: string;
  userId: string;
  /** Slice 3: the caller's `calendar.view` scope. `OWN` sees only their own appointments. */
  scope?: string | null;
  limit?: number;
}

export class GetUpcomingAppointmentsUseCase {
  constructor(private readonly appointmentRepository: IAppointmentRepository) {}

  async execute(dto: GetUpcomingAppointmentsDTO) {
    const assignedUserId = dto.scope === 'OWN' ? dto.userId : undefined;
    const limit = dto.limit ?? 5;

    const appointments = await this.appointmentRepository.findUpcoming(
      dto.tenantId,
      assignedUserId,
      limit
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
