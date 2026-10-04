import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { admits } from '../../../access/domain/RecordScope';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { IAppointmentRepository } from '../../domain/repositories/IAppointmentRepository';
import { Appointment } from '../../domain/entities/Appointment';
import { DomainError } from '../../../shared/domain/errors/DomainError';
import { IPlanningLinks } from '../../domain/repositories/IPlanningLinks';
import { NotificationService } from '../../../notifications/application/NotificationService';

export interface CreateAppointmentDTO {
  tenantId: string;
  clientId: string;
  assignedUserId: string;
  scheduledAt: Date;
  notes?: string;
  /** FR-CAL-02: CALL, VISIT, MEETING or ONLINE_MEETING. Defaults to a meeting. */
  type?: string;
  dealId?: string | null;
  contactPersonId?: string | null;
  endAt?: Date | null;
  /** Where a visit takes place. */
  place?: string | null;
  /**
   * Who is creating it. Added for notifications: cancel and reschedule already
   * carried `changedByUserId`, but create carried no actor at all, so
   * "X scheduled an appointment for you" had no X to name.
   */
  actingUserId: string;
  access: AccessContext;
}

/** The deal and the contact have to be the company's own (FR-CAL-02). */
export async function assertLinks(
  links: IPlanningLinks,
  tenantId: string,
  clientId: string,
  dealId?: string | null,
  contactPersonId?: string | null
): Promise<void> {
  if (dealId && !(await links.dealBelongsToCompany(tenantId, clientId, dealId))) {
    throw new DomainError('That deal does not belong to this company.');
  }
  if (contactPersonId && !(await links.contactBelongsToCompany(tenantId, clientId, contactPersonId))) {
    throw new DomainError('That contact does not belong to this company.');
  }
}

export class CreateAppointmentUseCase {
  constructor(
    private readonly appointmentRepository: IAppointmentRepository,
    private readonly clientRepository: any, // IClientRepository in reality
    private readonly userRepository: any, // IUserRepository in reality
    private readonly scopes: RecordScopeResolver,
    private readonly links: IPlanningLinks,
    private readonly notifications?: NotificationService
  ) {}

  /**
   * FR-RBAC-11: an appointment is an activity of its company, so the company
   * has to be inside the viewer's `activities.add` scope, and so does the
   * person it is assigned to — at OWN scope, that is the viewer themselves.
   */
  async execute(dto: CreateAppointmentDTO): Promise<Appointment> {
    const scope = await this.scopes.resolve(dto.access, 'activities.add');
    if (!admits(scope, dto.assignedUserId)) {
      throw new PermissionDeniedError('activities.add', 'You cannot schedule an appointment for this person.');
    }
    const client = await this.clientRepository.findById(dto.tenantId, dto.clientId, { scope });
    if (!client) {
      throw new Error('Client not found');
    }
    if (client.tenantId !== dto.tenantId) {
      throw new DomainError('Client does not belong to this tenant');
    }

    const user = await this.userRepository.findById(dto.assignedUserId);
    if (!user) {
      throw new Error('Assigned user not found');
    }
    if (user.tenantId !== dto.tenantId) {
      throw new DomainError('Assigned user does not belong to this tenant');
    }

    await assertLinks(this.links, dto.tenantId, dto.clientId, dto.dealId, dto.contactPersonId);

    const appointment = Appointment.plan({
      id: crypto.randomUUID(), // Assuming a UUID generator or pass it in
      tenantId: dto.tenantId,
      clientId: dto.clientId,
      assignedUserId: dto.assignedUserId,
      scheduledAt: dto.scheduledAt,
      notes: dto.notes,
      type: dto.type,
      dealId: dto.dealId,
      contactPersonId: dto.contactPersonId,
      endAt: dto.endAt,
      place: dto.place,
      clientTenantId: client.tenantId,
      assignedUserTenantId: user.tenantId,
    });

    await this.appointmentRepository.save(appointment);

    /*
     * emitSafe, not emit: this write is not in a transaction with the
     * appointment, and a failed notification must not lose a saved
     * appointment. The quotation transitions can use `emit` because there the
     * notification commits with the change it describes.
     *
     * Self-assignment produces nothing — NotificationService drops a recipient
     * who is also the actor, which is the common case here since the form
     * defaults to "Myself".
     */
    await this.notifications?.emitSafe({
      tenantId: dto.tenantId,
      recipientUserIds: [dto.assignedUserId],
      type: 'APPOINTMENT_ASSIGNED',
      // Snapshot: the client name as it was when the appointment was made.
      params: { client: client.name ?? '' },
      actorUserId: dto.actingUserId,
      entityType: 'APPOINTMENT',
      entityId: appointment.id,
    });

    return appointment;
  }
}
