import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { IClientRepository } from '../../domain/repositories/IClientRepository';
import { NotificationService } from '../../../notifications/application/NotificationService';
import { ICustomFieldDefinitionRepository } from '../../domain/repositories/ICustomFieldDefinitionRepository';
import { ILookupStore } from '../../../lookups/application/ports/ILookupStore';
import { IClientWriteTransaction } from '../ports/IClientWriteTransaction';
import { EnsureDefaultClientFieldsUseCase } from './EnsureDefaultClientFieldsUseCase';
import { ClientFieldResolver } from '../../domain/services/ClientFieldResolver';
import { Client } from '../../domain/entities/Client';
import { CompanyProfileInput } from '../../domain/value-objects/CompanyProfile';
import { loadCompanyProfile } from '../loadCompanyProfile';
import { TaxIdTakenError } from '../../domain/errors';
import { DomainError } from '../../../shared/domain/errors/DomainError';
import { AuditAction } from '../../../audit/domain/AuditAction';

interface UpdateClientDTO {
  tenantId: string;
  clientId: string;
  customFieldValues?: Record<string, any>;
  /** Omitted leaves the existing notes untouched; '' clears them. */
  notes?: string | null;
  /** Omitted leaves the existing company profile untouched; the HTTP schema requires it on every edit through the company form. */
  profile?: CompanyProfileInput;
  updatingUserId: string;
  access: AccessContext;
}

export interface UpdateClientResult {
  client: Client;
  warnings: string[];
}

export class UpdateClientUseCase {
  constructor(
    private clientRepo: IClientRepository,
    private customFieldRepo: ICustomFieldDefinitionRepository,
    private ensureDefaultFields: EnsureDefaultClientFieldsUseCase,
    private scopes: RecordScopeResolver,
    private writeTx?: IClientWriteTransaction,
    private lookupStore?: ILookupStore,
    private notifications?: NotificationService
  ) {}

  async execute(dto: UpdateClientDTO): Promise<UpdateClientResult> {
    // Outside the viewer's companies.edit scope reads as not found (FR-RBAC-05, 11).
    const scope = await this.scopes.resolve(dto.access, 'companies.edit');
    const existingClient = await this.clientRepo.findById(dto.tenantId, dto.clientId, { scope });
    if (!existingClient || existingClient.tenantId !== dto.tenantId) {
      throw new DomainError('Client not found or access denied');
    }

    const definitions = await this.ensureDefaultFields.execute(dto.tenantId);

    // Merge custom field values
    const mergedCustomFields = dto.customFieldValues
      ? { ...existingClient.customFieldValues, ...dto.customFieldValues }
      : existingClient.customFieldValues;

    const profile = dto.profile
      ? await loadCompanyProfile(this.requireLookupStore(), dto.tenantId, dto.profile)
      : existingClient.profile;

    if (profile?.taxId) {
      const clash = await this.clientRepo.findByTaxId(dto.tenantId, profile.taxId, existingClient.id);
      if (clash) throw new TaxIdTakenError();
    }

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
      profile,
      lastUpdatedByUserId: dto.updatingUserId,
      createdAt: existingClient.createdAt,
      updatedAt: new Date(),
    }, definitions);

    const warnings: string[] = [];
    if (updatedClient.name !== existingClient.name) {
      const clashes = await this.clientRepo.countByName(dto.tenantId, updatedClient.name, existingClient.id);
      if (clashes > 0) warnings.push('DUPLICATE_NAME');
    }

    // Handing a company to someone else is its own permission: without it an
    // edit may not move the responsible salesperson.
    const previousAssignee = existingClient.assignedUserId ?? null;
    const newAssignee = updatedClient.assignedUserId ?? null;
    const isReassignment = newAssignee !== previousAssignee;
    if (isReassignment) {
      dto.access.ensure('companies.reassign');
    }

    await this.requireWriteTx().run(async ({ clients, auditTrail }) => {
      await clients.update(dto.tenantId, updatedClient);
      if (isReassignment) {
        await auditTrail.record({
          tenantId: dto.tenantId,
          userId: dto.access.userId,
          userRole: dto.access.auditRole,
          action: AuditAction.Update,
          entityType: 'Client',
          entityId: updatedClient.id,
          entityLabel: updatedClient.name,
          changes: [{ field: 'assignedUserId', old: previousAssignee, new: newAssignee }],
        });
      }
    });

    /*
     * Only a CHANGE of assignee notifies. `assignedUserId` is part of every
     * client edit, so notifying whenever it is merely present would fire on
     * unrelated edits — renaming a client would tell its owner they had been
     * assigned it again. `existingClient` is already loaded above, so the
     * before/after comparison costs nothing.
     */
    if (newAssignee && isReassignment) {
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

    return { client: updatedClient, warnings };
  }

  private requireLookupStore(): ILookupStore {
    if (!this.lookupStore) {
      throw new Error('UpdateClientUseCase received a company profile but has no lookup store wired.');
    }
    return this.lookupStore;
  }

  private requireWriteTx(): IClientWriteTransaction {
    if (!this.writeTx) {
      throw new Error('UpdateClientUseCase has no write transaction wired.');
    }
    return this.writeTx;
  }
}
