import { admits } from '../../../access/domain/RecordScope';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { findReachableAppointment } from './appointmentAccess';
import { IAppointmentRepository } from '../../domain/repositories/IAppointmentRepository';
import { IClientRepository } from '../../../clients/domain/repositories/IClientRepository';
import { IUserRepository } from '../../../auth/domain/repositories/IUserRepository';
import { Appointment } from '../../domain/entities/Appointment';

export interface UpdateAppointmentDTO {
  id: string;
  tenantId: string;
  access: AccessContext;
  clientId?: string;
  assignedUserId?: string;
  scheduledAt?: Date;
  notes?: string;
}

export class UpdateAppointmentUseCase {
  constructor(
    private readonly appointmentRepository: IAppointmentRepository,
    private readonly scopes: RecordScopeResolver,
    private readonly clientRepository: IClientRepository,
    private readonly userRepository: IUserRepository
  ) {}

  async execute(dto: UpdateAppointmentDTO): Promise<Appointment> {
    const appointment = await findReachableAppointment(
      this.appointmentRepository,
      this.scopes,
      dto.access,
      'activities.add',
      dto.id,
      dto.tenantId
    );

    // The new company and the new assignee must be inside the same scope the
    // appointment itself was reached through (FR-RBAC-11).
    const scope = await this.scopes.resolve(dto.access, 'activities.add');
    if (dto.clientId && dto.clientId !== appointment.clientId) {
      const client = await this.clientRepository.findById(dto.tenantId, dto.clientId, { scope });
      if (!client) {
        throw new Error('Invalid client');
      }
    }

    if (dto.assignedUserId && dto.assignedUserId !== appointment.assignedUserId) {
      if (!admits(scope, dto.assignedUserId)) {
        throw new PermissionDeniedError('activities.add', 'You cannot assign this appointment to that person.');
      }
      const user = await this.userRepository.findById(dto.assignedUserId);
      if (!user || user.tenantId !== dto.tenantId) {
        throw new Error('Invalid assigned user');
      }
    }

    appointment.updateDetails({
      clientId: dto.clientId,
      assignedUserId: dto.assignedUserId,
      scheduledAt: dto.scheduledAt,
      notes: dto.notes,
    });

    await this.appointmentRepository.update(appointment);
    return appointment;
  }
}

