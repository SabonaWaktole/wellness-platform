import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { findReachableAppointment } from './appointmentAccess';
import { IAppointmentRepository } from '../../domain/repositories/IAppointmentRepository';
import { Appointment } from '../../domain/entities/Appointment';
import { NotificationService } from '../../../notifications/application/NotificationService';

export interface CancelAppointmentDTO {
  id: string;
  tenantId: string;
  access: AccessContext;
  reason: string;
  changedByUserId: string;
}

export class CancelAppointmentUseCase {
  constructor(
    private readonly appointmentRepository: IAppointmentRepository,
    private readonly scopes: RecordScopeResolver,
    private readonly notifications?: NotificationService
  ) {}

  async execute(dto: CancelAppointmentDTO): Promise<Appointment> {
    const appointment = await findReachableAppointment(
      this.appointmentRepository,
      this.scopes,
      dto.access,
      'activities.add',
      dto.id,
      dto.tenantId
    );

    appointment.cancel(dto.reason, dto.changedByUserId);

    await this.appointmentRepository.update(appointment);

    // The assignee needs to know their appointment is off; if they cancelled
    // it themselves, emit drops them and nothing is written.
    await this.notifications?.emitSafe({
      tenantId: dto.tenantId,
      recipientUserIds: [appointment.assignedUserId],
      type: 'APPOINTMENT_CANCELLED',
      params: { reason: dto.reason },
      actorUserId: dto.changedByUserId,
      entityType: 'APPOINTMENT',
      entityId: appointment.id,
    });

    return appointment;
  }
}
