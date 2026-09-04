import { randomUUID } from 'crypto';
import { ICustomFieldDefinitionRepository } from '../../domain/repositories/ICustomFieldDefinitionRepository';
import { IClientRepository } from '../../domain/repositories/IClientRepository';
import { CustomFieldDefinition } from '../../domain/entities/CustomFieldDefinition';
import { FieldType } from '../../domain/enums/FieldType';
import { FieldRole } from '../../domain/enums/FieldRole';

interface DefaultFieldSeed {
  role: FieldRole;
  fieldName: string;
  fieldType: FieldType;
  options?: string[];
  required?: boolean;
}

const DEFAULT_FIELDS: DefaultFieldSeed[] = [
  { role: FieldRole.PRIMARY_NAME, fieldName: 'Name', fieldType: FieldType.TEXT, required: true },
  { role: FieldRole.PRIMARY_EMAIL, fieldName: 'Email', fieldType: FieldType.EMAIL },
  { role: FieldRole.PRIMARY_PHONE, fieldName: 'Phone', fieldType: FieldType.TEXT },
  {
    role: FieldRole.STATUS,
    fieldName: 'Status',
    fieldType: FieldType.SINGLE_SELECT,
    options: ['PROSPECT', 'ACTIVE', 'INACTIVE'],
    required: true,
  },
  { role: FieldRole.ASSIGNEE, fieldName: 'Assigned To', fieldType: FieldType.USER_REFERENCE },
];

/**
 * name/email/phone/status/assignedUserId used to be created automatically as
 * fixed Client columns. Now that they're ordinary tenant-editable custom
 * fields (see FieldRole), every tenant needs them seeded once — for brand
 * new tenants (nothing to backfill) and for tenants created before this
 * change (existing Client rows still carry the legacy columns, which get
 * merged into customFieldValues under the newly seeded field names so
 * existing clients don't appear to have lost their data).
 *
 * Seeds exactly ONCE per tenant, recorded by Tenant.clientFieldsSeededAt.
 * This is deliberately not "recreate whichever roles are missing": these are
 * ordinary tenant-editable fields, so a business owner is allowed to delete
 * one, and re-deriving the work to do from the current roles made that
 * impossible — the next read of the field list resurrected the deleted field
 * at the bottom of the order.
 *
 * Cheap once seeded: one indexed tenant lookup, then a single findByTenantId.
 */
export class EnsureDefaultClientFieldsUseCase {
  constructor(
    private customFieldRepo: ICustomFieldDefinitionRepository,
    private clientRepo: IClientRepository
  ) {}

  async execute(tenantId: string): Promise<CustomFieldDefinition[]> {
    if (await this.customFieldRepo.hasSeededDefaults(tenantId)) {
      return this.customFieldRepo.findByTenantId(tenantId);
    }

    const existing = await this.customFieldRepo.findByTenantId(tenantId);
    // Still filtered by role: a tenant seeded by an older build of this use
    // case (before the stamp existed) may already hold some of these.
    const missing = DEFAULT_FIELDS.filter(seed => !existing.some(f => f.role === seed.role));
    if (missing.length === 0) {
      await this.customFieldRepo.markDefaultsSeeded(tenantId);
      return existing;
    }

    const nextOrderStart = existing.reduce((max, f) => Math.max(max, f.order), -1) + 1;
    const created: CustomFieldDefinition[] = [];

    for (let i = 0; i < missing.length; i++) {
      const seed = missing[i];
      try {
        const definition = CustomFieldDefinition.create({
          id: randomUUID(),
          tenantId,
          fieldName: seed.fieldName,
          fieldType: seed.fieldType,
          options: seed.options,
          order: nextOrderStart + i,
          role: seed.role,
          required: seed.required ?? false,
        });
        await this.customFieldRepo.save(tenantId, definition);
        created.push(definition);
      } catch {
        // Lost a race with a concurrent request seeding the same tenant, or
        // a field with this exact name already exists unroled — either way,
        // move on rather than failing the caller's request.
      }
    }

    await this.customFieldRepo.markDefaultsSeeded(tenantId);

    if (created.length > 0) {
      const fieldNameByRole: Partial<Record<FieldRole, string>> = {};
      for (const def of created) {
        if (def.role) fieldNameByRole[def.role] = def.fieldName;
      }
      await this.clientRepo.backfillLegacyBasicFields(tenantId, fieldNameByRole);
    }

    return this.customFieldRepo.findByTenantId(tenantId);
  }
}
