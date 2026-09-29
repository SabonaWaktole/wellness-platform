import { AccessContext } from '../../../access/domain/AccessContext';
import { FieldRole } from '../../domain/enums/FieldRole';
import { IClientRepository } from '../../domain/repositories/IClientRepository';
import { NotificationService } from '../../../notifications/application/NotificationService';
import { ICustomFieldDefinitionRepository } from '../../domain/repositories/ICustomFieldDefinitionRepository';
import { ILookupStore } from '../../../lookups/application/ports/ILookupStore';
import { EnsureDefaultClientFieldsUseCase } from './EnsureDefaultClientFieldsUseCase';
import { ClientFieldResolver } from '../../domain/services/ClientFieldResolver';
import { Client } from '../../domain/entities/Client';
import { CompanyProfileInput } from '../../domain/value-objects/CompanyProfile';
import { loadCompanyProfile } from '../loadCompanyProfile';
import { TaxIdTakenError } from '../../domain/errors';
import { randomUUID } from 'crypto';

interface CreateClientDTO {
  tenantId: string;
  /**
   * name/email/phone/status/assignedUserId are no longer separate fields —
   * they're ordinary entries in here, keyed by whatever the tenant has
   * currently named those fields (see FieldRole / ClientFieldResolver).
   */
  customFieldValues?: Record<string, any>;
  /** Internal notes. A system field, not one of the tenant's custom fields. */
  notes?: string | null;
  /**
   * The Slice 11 company profile. Required by the HTTP schema for a company
   * created through the company form; omitted by ImportClientsUseCase and
   * the public-form path (decision: those keep creating incomplete
   * companies, which Slice 14's "needs completion" report picks up).
   */
  profile?: CompanyProfileInput;
  authorUserId: string;
  /** `null` for a system actor (a public form submission), which is bound by neither rule below. */
  access: AccessContext | null;
}

export interface CreateClientResult {
  client: Client;
  /** Non-blocking notices about the save — currently just a duplicate name (FR-CMP-02). */
  warnings: string[];
}

export class CreateClientUseCase {
  constructor(
    private clientRepo: IClientRepository,
    private customFieldRepo: ICustomFieldDefinitionRepository,
    private ensureDefaultFields: EnsureDefaultClientFieldsUseCase,
    private lookupStore?: ILookupStore,
    private notifications?: NotificationService
  ) {}

  async execute(dto: CreateClientDTO): Promise<CreateClientResult> {
    const definitions = await this.ensureDefaultFields.execute(dto.tenantId);
    const customFieldValues = this.withResponsibleSalesperson(dto, definitions);

    const profile = dto.profile
      ? await loadCompanyProfile(this.requireLookupStore(), dto.tenantId, dto.profile)
      : null;

    if (profile?.taxId) {
      const clash = await this.clientRepo.findByTaxId(dto.tenantId, profile.taxId);
      if (clash) throw new TaxIdTakenError();
    }

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
      notes: dto.notes ?? null,
      profile,
      lastUpdatedByUserId: dto.authorUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    }, definitions);

    const warnings: string[] = [];
    if ((await this.clientRepo.countByName(dto.tenantId, client.name)) > 0) {
      warnings.push('DUPLICATE_NAME');
    }

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

    return { client, warnings };
  }

  private requireLookupStore(): ILookupStore {
    if (!this.lookupStore) {
      throw new Error('CreateClientUseCase received a company profile but has no lookup store wired.');
    }
    return this.lookupStore;
  }

  /**
   * FR-RBAC-14: a company created by someone who only sees their own
   * companies (a Sales User) is theirs unless they say otherwise — without
   * this they would create a company and immediately lose sight of it.
   * Naming anyone other than yourself takes `companies.reassign`, the same
   * rule UpdateClientUseCase applies to a change of assignee.
   */
  private withResponsibleSalesperson(
    dto: CreateClientDTO,
    definitions: Awaited<ReturnType<EnsureDefaultClientFieldsUseCase['execute']>>
  ): Record<string, any> {
    const values = { ...(dto.customFieldValues || {}) };
    if (!dto.access) {
      return values;
    }
    const assignee = ClientFieldResolver.resolveAssignedUserId(values, definitions);
    const assigneeField = ClientFieldResolver.findFieldNameForRole(definitions, FieldRole.ASSIGNEE);

    if (!assignee && assigneeField && dto.access.ownOnly('companies.view')) {
      values[assigneeField] = dto.authorUserId;
    } else if (assignee && assignee !== dto.authorUserId) {
      dto.access.ensure('companies.reassign');
    }
    return values;
  }
}
