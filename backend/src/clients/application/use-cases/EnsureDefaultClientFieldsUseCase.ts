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
 * Idempotent and cheap once seeded: a single findByTenantId, early return if
 * every role already has a field.
 */
export class EnsureDefaultClientFieldsUseCase {
  constructor(
    private customFieldRepo: ICustomFieldDefinitionRepository,
    private clientRepo: IClientRepository
  ) {}

  async execute(tenantId: string): Promise<CustomFieldDefinition[]> {
    const existing = await this.customFieldRepo.findByTenantId(tenantId);
    const missing = DEFAULT_FIELDS.filter(seed => !existing.some(f => f.role === seed.role));
    if (missing.length === 0) return existing;

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
