import { AccessContext } from '../../../access/domain/AccessContext';
import { ICustomFieldDefinitionRepository } from '../../domain/repositories/ICustomFieldDefinitionRepository';
import { CustomFieldDefinition } from '../../domain/entities/CustomFieldDefinition';
import { FieldType } from '../../domain/enums/FieldType';
import { FieldRole } from '../../domain/enums/FieldRole';
import { DomainError } from '../../../shared/domain/errors/DomainError';
import { randomUUID } from 'crypto';

interface DefineCustomFieldDTO {
  tenantId: string;
  access: AccessContext;
  fieldName: string;
  fieldType: FieldType;
  options?: string[];
  role?: FieldRole | null;
  required?: boolean;
}

export class DefineCustomFieldUseCase {
  constructor(private customFieldRepo: ICustomFieldDefinitionRepository) {}

  async execute(dto: DefineCustomFieldDTO): Promise<CustomFieldDefinition> {
    dto.access.ensure('settings.manage');

    if (dto.role) {
      const existing = await this.customFieldRepo.findByTenantIdAndRole(dto.tenantId, dto.role);
      if (existing) {
        throw new DomainError(`Field "${existing.fieldName}" already has the "${dto.role}" role.`);
      }
    }

    const existingFields = await this.customFieldRepo.findByTenantId(dto.tenantId);

    // Checked here rather than left to the database's unique constraint on
    // (tenantId, fieldName): a raw P2002 violation reaching the controller
    // becomes an unfiltered Prisma stack trace in the response (it doesn't
    // match PermissionDeniedError, so it falls through
    // to a bare 400 with the driver's own message) — the exact failure mode
    // this closes. Case-insensitive, matching ImportCustomFieldsUseCase's
    // existing duplicate check for the same field.
    const trimmedName = dto.fieldName.trim();
    const nameTaken = existingFields.some(
      f => f.fieldName.toLowerCase() === trimmedName.toLowerCase()
    );
    if (nameTaken) {
      throw new DomainError(`A field named "${trimmedName}" already exists.`);
    }

    const nextOrder = existingFields.reduce((max, f) => Math.max(max, f.order), -1) + 1;

    const definition = CustomFieldDefinition.create({
      id: randomUUID(),
      tenantId: dto.tenantId,
      fieldName: trimmedName,
      fieldType: dto.fieldType,
      options: dto.options,
      order: nextOrder,
      role: dto.role ?? null,
      required: dto.required ?? false,
    });

    await this.customFieldRepo.save(dto.tenantId, definition);
    return definition;
  }
}
