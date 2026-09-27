import { IClientRepository } from '../../domain/repositories/IClientRepository';
import { IInteractionRepository } from '../../domain/repositories/IInteractionRepository';
import { IAppointmentRepository } from '../../../appointments/domain/repositories/IAppointmentRepository';
import { InteractionChannel } from '../../domain/enums/InteractionChannel';
import { DomainError } from '../../../shared/domain/errors/DomainError';
import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';

import { TimelineMerger } from '../../../shared/application/TimelineMerger';

interface GetClientHistoryDTO {
  tenantId: string;
  clientId: string;
  access: AccessContext;
}

export class GetClientHistoryUseCase {
  constructor(
    private clientRepo: IClientRepository,
    private interactionRepo: IInteractionRepository,
    private scopes: RecordScopeResolver,
    private appointmentRepo?: IAppointmentRepository
  ) {}

  /**
   * The company's timeline, for a company inside the viewer's
   * `companies.view` scope (FR-RBAC-11). What it shows follows D3: notes
   * need `notes.view`; calls, emails, visits and meetings — appointments
   * included — need `activities.view`. Reception therefore sees notes only.
   */
  async execute(dto: GetClientHistoryDTO): Promise<{ timeline: any[] }> {
    const scope = await this.scopes.resolve(dto.access, 'companies.view');
    const client = await this.clientRepo.findById(dto.tenantId, dto.clientId, { scope });
    if (!client || client.tenantId !== dto.tenantId) {
      throw new DomainError('Client not found or access denied');
    }

    const seesNotes = dto.access.can('notes.view');
    const seesActivities = dto.access.can('activities.view');

    const interactions = (await this.interactionRepo.findByClientId(dto.tenantId, dto.clientId)).filter(
      (interaction) => (interaction.channel === InteractionChannel.NOTE ? seesNotes : seesActivities)
    );
    const appointments =
      this.appointmentRepo && seesActivities
        ? await this.appointmentRepo.findByClientId(dto.clientId, dto.tenantId)
        : [];

    const timeline = TimelineMerger.merge(interactions, appointments);

    return { timeline };
  }
}
