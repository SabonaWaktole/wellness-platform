import { IClientRepository } from '../../domain/repositories/IClientRepository';
import { NotificationService } from '../../../notifications/application/NotificationService';
import { ICustomFieldDefinitionRepository } from '../../domain/repositories/ICustomFieldDefinitionRepository';
import { EnsureDefaultClientFieldsUseCase } from './EnsureDefaultClientFieldsUseCase';
import { ClientFieldResolver } from '../../domain/services/ClientFieldResolver';
import { Client } from '../../domain/entities/Client';
import { DomainError } from '../../../shared/domain/errors/DomainError';

interface UpdateClientDTO {
  tenantId: string;
  clientId: string;
  customFieldValues?: Record<string, any>;
  /** Omitted leaves the existing notes untouched; '' clears them. */
  notes?: string | null;
  updatingUserId: string;
}

export class UpdateClientUseCase {
  constructor(
    private clientRepo: IClientRepository,
    private customFieldRepo: ICustomFieldDefinitionRepository,
    private ensureDefaultFields: EnsureDefaultClientFieldsUseCase,
    private notifications?: NotificationService
  ) {}

  async execute(dto: UpdateClientDTO): Promise<Client> {
    const existingClient = await this.clientRepo.findById(dto.tenantId, dto.clientId);
    if (!existingClient || existingClient.tenantId !== dto.tenantId) {
      throw new DomainError('Client not found or access denied');
    }

    const definitions = await this.ensureDefaultFields.execute(dto.tenantId);

    // Merge custom field values
    const mergedCustomFields = dto.customFieldValues
      ? { ...existingClient.customFieldValues, ...dto.customFieldValues }
      : existingClient.customFieldValues;

    // We rely on Client.create to validate custom fields again
    const updatedClient = Client.create({
      id: existingClient.id,
      tenantId: existingClient.tenantId,
      name: ClientFieldResolver.resolveName(mergedCustomFields, definitions),
      contactInfo: {
        email: ClientFieldResolver.resolveEmail(mergedCustomFields, definitions),
        phone: ClientFieldResolver.resolvePhone(mergedCustomFields, definitions),
      },
      status: ClientFieldResolver.resolveStatus(mergedCustomFields, definitions) ?? '',
      assignedUserId: ClientFieldResolver.resolveAssignedUserId(mergedCustomFields, definitions) ?? null,
      customFieldValues: mergedCustomFields,
      // Same merge rule as custom fields: absent means "not being edited", so
      // an update that omits notes must not wipe them.
      notes: dto.notes !== undefined ? dto.notes : existingClient.notes,
      lastUpdatedByUserId: dto.updatingUserId,
      createdAt: existingClient.createdAt,
      updatedAt: new Date(),
    }, definitions);

    await this.clientRepo.update(dto.tenantId, updatedClient);

    /*
     * Only a CHANGE of assignee notifies. `assignedUserId` is part of every
     * client edit, so notifying whenever it is merely present would fire on
     * unrelated edits — renaming a client would tell its owner they had been
     * assigned it again. `existingClient` is already loaded above, so the
     * before/after comparison costs nothing.
     */
    const previousAssignee = existingClient.assignedUserId ?? null;
    const newAssignee = updatedClient.assignedUserId ?? null;
    if (newAssignee && newAssignee !== previousAssignee) {
      await this.notifications?.emitSafe({
        tenantId: dto.tenantId,
        recipientUserIds: [newAssignee],
        type: 'CLIENT_ASSIGNED',
        params: { client: updatedClient.name },
        actorUserId: dto.updatingUserId,
        entityType: 'CLIENT',
        entityId: updatedClient.id,
      });
    }

    return updatedClient;
  }
}
