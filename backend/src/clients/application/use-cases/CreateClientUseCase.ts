import { IClientRepository } from '../../domain/repositories/IClientRepository';
import { NotificationService } from '../../../notifications/application/NotificationService';
import { ICustomFieldDefinitionRepository } from '../../domain/repositories/ICustomFieldDefinitionRepository';
import { EnsureDefaultClientFieldsUseCase } from './EnsureDefaultClientFieldsUseCase';
import { ClientFieldResolver } from '../../domain/services/ClientFieldResolver';
import { Client } from '../../domain/entities/Client';
import { randomUUID } from 'crypto';

interface CreateClientDTO {
  tenantId: string;
  /**
   * name/email/phone/status/assignedUserId are no longer separate fields —
   * they're ordinary entries in here, keyed by whatever the tenant has
   * currently named those fields (see FieldRole / ClientFieldResolver).
   */
  customFieldValues?: Record<string, any>;
  authorUserId: string;
}

export class CreateClientUseCase {
  constructor(
    private clientRepo: IClientRepository,
    private customFieldRepo: ICustomFieldDefinitionRepository,
    private ensureDefaultFields: EnsureDefaultClientFieldsUseCase,
    private notifications?: NotificationService
  ) {}

  async execute(dto: CreateClientDTO): Promise<Client> {
    const definitions = await this.ensureDefaultFields.execute(dto.tenantId);
    const customFieldValues = dto.customFieldValues || {};

    const client = Client.create({
      id: randomUUID(),
      tenantId: dto.tenantId,
      name: ClientFieldResolver.resolveName(customFieldValues, definitions),
      contactInfo: {
        email: ClientFieldResolver.resolveEmail(customFieldValues, definitions),
        phone: ClientFieldResolver.resolvePhone(customFieldValues, definitions),
      },
      status: ClientFieldResolver.resolveStatus(customFieldValues, definitions) ?? '',
      assignedUserId: ClientFieldResolver.resolveAssignedUserId(customFieldValues, definitions) ?? null,
      customFieldValues,
      lastUpdatedByUserId: dto.authorUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    }, definitions);

    await this.clientRepo.save(dto.tenantId, client);

    // A client can be assigned at creation, so this is the second assignment
    // site, not a duplicate of the one in UpdateClientUseCase. There is no
    // previous value to compare against here — any assignee is a new one.
    if (client.assignedUserId) {
      await this.notifications?.emitSafe({
        tenantId: dto.tenantId,
        recipientUserIds: [client.assignedUserId],
        type: 'CLIENT_ASSIGNED',
        params: { client: client.name },
        actorUserId: dto.authorUserId,
        entityType: 'CLIENT',
        entityId: client.id,
      });
    }

    return client;
  }
}
