import { admits } from '../../../access/domain/RecordScope';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { findReachableAppointment } from './appointmentAccess';
import { IAppointmentRepository } from '../../domain/repositories/IAppointmentRepository';
import { IClientRepository } from '../../../clients/domain/repositories/IClientRepository';
import { IUserRepository } from '../../../auth/domain/repositories/IUserRepository';
import { Appointment } from '../../domain/entities/Appointment';
import { IPlanningLinks } from '../../domain/repositories/IPlanningLinks';
import { assertLinks } from './CreateAppointmentUseCase';

export interface UpdateAppointmentDTO {
  id: string;
  tenantId: string;
  access: AccessContext;
  clientId?: string;
  assignedUserId?: string;
  scheduledAt?: Date;
  notes?: string;
  /** FR-CAL-02. `null` clears a deal, contact, end or place. */
  type?: string;
  dealId?: string | null;
  contactPersonId?: string | null;
  endAt?: Date | null;
  place?: string | null;
}

export class UpdateAppointmentUseCase {
  constructor(
    private readonly appointmentRepository: IAppointmentRepository,
    private readonly scopes: RecordScopeResolver,
    private readonly clientRepository: IClientRepository,
    private readonly userRepository: IUserRepository,
    private readonly links: IPlanningLinks
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

    // A deal or contact is checked against the company the item ends up with.
    const clientId = dto.clientId ?? appointment.clientId;
    await assertLinks(this.links, dto.tenantId, clientId, dto.dealId, dto.contactPersonId);

    appointment.updateDetails({
      clientId: dto.clientId,
      assignedUserId: dto.assignedUserId,
      scheduledAt: dto.scheduledAt,
      notes: dto.notes,
      type: dto.type,
      dealId: dto.dealId,
      contactPersonId: dto.contactPersonId,
      endAt: dto.endAt,
      place: dto.place,
    });

    await this.appointmentRepository.update(appointment);
    return appointment;
  }
}

