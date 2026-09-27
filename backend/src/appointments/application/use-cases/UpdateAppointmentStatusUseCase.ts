import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { findReachableAppointment } from './appointmentAccess';
import { IAppointmentRepository } from '../../domain/repositories/IAppointmentRepository';
import { Appointment } from '../../domain/entities/Appointment';

export interface UpdateAppointmentStatusDTO {
  id: string;
  tenantId: string;
  access: AccessContext;
  status: string;
}

export class UpdateAppointmentStatusUseCase {
  constructor(
    private readonly appointmentRepository: IAppointmentRepository,
    private readonly scopes: RecordScopeResolver
  ) {}

  async execute(dto: UpdateAppointmentStatusDTO): Promise<Appointment> {
    const appointment = await findReachableAppointment(
      this.appointmentRepository,
      this.scopes,
      dto.access,
      'activities.add',
      dto.id,
      dto.tenantId
    );

    if (dto.status === 'CONFIRMED') {
      appointment.confirm();
    } else if (dto.status === 'COMPLETED') {
      appointment.complete();
    } else {
      throw new Error('Invalid status transition requested');
    }

    await this.appointmentRepository.update(appointment);
    return appointment;
  }
}
