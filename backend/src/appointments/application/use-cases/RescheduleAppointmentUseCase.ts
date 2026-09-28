import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { findReachableAppointment } from './appointmentAccess';
import { IAppointmentRepository } from '../../domain/repositories/IAppointmentRepository';
import { Appointment } from '../../domain/entities/Appointment';
import { NotificationService } from '../../../notifications/application/NotificationService';

export interface RescheduleAppointmentDTO {
  id: string;
  tenantId: string;
  access: AccessContext;
  newDate: Date;
  reason: string;
  changedByUserId: string;
}

export class RescheduleAppointmentUseCase {
  constructor(
    private readonly appointmentRepository: IAppointmentRepository,
    private readonly scopes: RecordScopeResolver,
    private readonly notifications?: NotificationService
  ) {}

  async execute(dto: RescheduleAppointmentDTO): Promise<Appointment> {
    const appointment = await findReachableAppointment(
      this.appointmentRepository,
      this.scopes,
      dto.access,
      'activities.add',
      dto.id,
      dto.tenantId
    );

    appointment.reschedule(dto.newDate, dto.reason, dto.changedByUserId);

    await this.appointmentRepository.update(appointment);

    /*
     * The new time is NOT snapshotted into params as a formatted string.
     * A date rendered server-side would be frozen in one locale and one
     * timezone, and this notification may be read days later by someone whose
     * workspace formats dates differently — the tenant timezone is precisely
     * what TD-029 established as the authority. The ISO instant is stored and
     * the client formats it through useDateFormat, like every other date.
     */
    await this.notifications?.emitSafe({
      tenantId: dto.tenantId,
      recipientUserIds: [appointment.assignedUserId],
      type: 'APPOINTMENT_RESCHEDULED',
      params: { scheduledAt: appointment.scheduledAt.toISOString(), reason: dto.reason },
      actorUserId: dto.changedByUserId,
      entityType: 'APPOINTMENT',
      entityId: appointment.id,
    });

    return appointment;
  }
}
