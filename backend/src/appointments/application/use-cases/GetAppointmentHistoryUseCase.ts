import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { findReachableAppointment } from './appointmentAccess';
import { IAppointmentRepository } from '../../domain/repositories/IAppointmentRepository';

export class GetAppointmentHistoryUseCase {
  constructor(
    private readonly appointmentRepository: IAppointmentRepository,
    private readonly scopes: RecordScopeResolver
  ) {}

  async execute(dto: { id: string; tenantId: string; access: AccessContext }) {
    const appointment = await findReachableAppointment(
      this.appointmentRepository,
      this.scopes,
      dto.access,
      'calendar.view',
      dto.id,
      dto.tenantId
    );

    return appointment.history.map((log) => ({
      id: log.id,
      previousDate: log.previousDate,
      newDate: log.newDate,
      reason: log.reason,
      changedBy: log.changedBy,
      createdAt: log.createdAt,
    }));
  }
}
