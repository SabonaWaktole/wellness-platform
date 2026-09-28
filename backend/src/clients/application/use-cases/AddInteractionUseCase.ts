import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { IClientRepository } from '../../domain/repositories/IClientRepository';
import { IInteractionRepository } from '../../domain/repositories/IInteractionRepository';
import { IOutcomeCategoryRepository } from '../../domain/repositories/IOutcomeCategoryRepository';
import { Interaction } from '../../domain/entities/Interaction';
import { InteractionChannel } from '../../domain/enums/InteractionChannel';
import { DomainError } from '../../../shared/domain/errors/DomainError';
import { randomUUID } from 'crypto';

interface AddInteractionDTO {
  tenantId: string;
  clientId: string;
  authorUserId: string;
  content: string;
  channel: InteractionChannel;
  outcomeCategoryId?: string;
  access: AccessContext;
}

export class AddInteractionUseCase {
  constructor(
    private clientRepo: IClientRepository,
    private interactionRepo: IInteractionRepository,
    private outcomeRepo: IOutcomeCategoryRepository,
    private scopes: RecordScopeResolver
  ) {}

  /**
   * D3: a NOTE needs `notes.add`, every other channel `activities.add` — and
   * the company has to be inside that permission's scope (FR-RBAC-11).
   */
  async execute(dto: AddInteractionDTO): Promise<Interaction> {
    const key = dto.channel === InteractionChannel.NOTE ? 'notes.add' : 'activities.add';
    dto.access.ensure(key);
    const scope = await this.scopes.resolve(dto.access, key);
    const client = await this.clientRepo.findById(dto.tenantId, dto.clientId, { scope });
    if (!client || client.tenantId !== dto.tenantId) {
      throw new DomainError('Client not found or access denied');
    }

    let outcomeCategory = null;
    if (dto.outcomeCategoryId) {
      outcomeCategory = await this.outcomeRepo.findById(dto.tenantId, dto.outcomeCategoryId);
      if (!outcomeCategory || outcomeCategory.tenantId !== dto.tenantId) {
        throw new DomainError('Outcome category not found or access denied');
      }
    }

    const interaction = Interaction.create({
      id: randomUUID(),
      tenantId: dto.tenantId,
      clientId: dto.clientId,
      authorUserId: dto.authorUserId,
      content: dto.content,
      channel: dto.channel,
      outcomeCategory: outcomeCategory,
      createdAt: new Date(),
    });

    await this.interactionRepo.save(dto.tenantId, interaction);
    return interaction;
  }
}
