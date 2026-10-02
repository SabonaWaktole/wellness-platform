import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { IClientRepository } from '../../domain/repositories/IClientRepository';
import { ActivityDetails, Interaction } from '../../domain/entities/Interaction';
import { DomainError } from '../../../shared/domain/errors/DomainError';
import { DealStage } from '../../../deals/domain/DealStage';
import { addKeyFor } from '../activityAccess';
import { ActivityReferenceReaders, checkActivityReferences } from '../activityReferences';
import { IInteractionWriteTransaction } from '../ports/IInteractionWriteTransaction';
import { randomUUID } from 'crypto';

interface AddInteractionDTO extends ActivityDetails {
  tenantId: string;
  clientId: string;
  authorUserId: string;
  access: AccessContext;
}

/** Records an activity on a company (FR-ACT-01, 02). */
export class AddInteractionUseCase {
  constructor(
    private clientRepo: IClientRepository,
    private readers: ActivityReferenceReaders,
    private writeTx: IInteractionWriteTransaction,
    private now: () => Date = () => new Date()
  ) {}

  /**
   * D3: a NOTE needs `notes.add`, every other channel `activities.add` — and
   * the company has to be inside that permission's scope (FR-RBAC-11).
   */
  async execute(dto: AddInteractionDTO): Promise<Interaction> {
    const key = addKeyFor(dto.channel);
    dto.access.ensure(key);
    const scope = await this.readers.scopes.resolve(dto.access, key);
    const client = await this.clientRepo.findById(dto.tenantId, dto.clientId, { scope });
    if (!client || client.tenantId !== dto.tenantId) {
      throw new DomainError('Client not found or access denied');
    }

    const now = this.now();
    const interaction = Interaction.record(
      { ...dto, id: randomUUID(), tenantId: dto.tenantId, clientId: dto.clientId, authorUserId: dto.authorUserId },
      now
    );

    return this.writeTx.run(async ({ interactions, deals }) => {
      const deal = await checkActivityReferences(this.readers, deals, {
        access: dto.access,
        tenantId: dto.tenantId,
        clientId: dto.clientId,
        details: interaction,
      });
      await interactions.save(dto.tenantId, interaction);

      // FR-DEAL-08: the first activity on a New Lead moves it to Contacted.
      // A note is not contact with the client; a deal past New Lead stays put.
      if (deal && !interaction.isNote) {
        const change = deal.advanceAutomatically(DealStage.Contacted, now, randomUUID);
        if (change) {
          await deals.update(deal);
          await deals.recordChange(dto.tenantId, change);
        }
      }
      return interaction;
    });
  }
}
