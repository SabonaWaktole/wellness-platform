import { ICustomFieldDefinitionRepository } from '../../domain/repositories/ICustomFieldDefinitionRepository';
import { CustomFieldDefinition } from '../../domain/entities/CustomFieldDefinition';
import { FieldType } from '../../domain/enums/FieldType';
import { FieldRole } from '../../domain/enums/FieldRole';
import { UserRole } from '../../../auth/domain/enums/UserRole';
import { DomainError } from '../../../shared/domain/errors/DomainError';
import { randomUUID } from 'crypto';

interface DefineCustomFieldDTO {
  tenantId: string;
  requestingUserRole: string;
  fieldName: string;
  fieldType: FieldType;
  options?: string[];
  role?: FieldRole | null;
  required?: boolean;
}

export class DefineCustomFieldUseCase {
  constructor(private customFieldRepo: ICustomFieldDefinitionRepository) {}

  async execute(dto: DefineCustomFieldDTO): Promise<CustomFieldDefinition> {
    if (dto.requestingUserRole !== UserRole.BUSINESS_OWNER && dto.requestingUserRole !== UserRole.SUPER_ADMIN) {
      throw new DomainError('Only Business Owners can define custom fields');
    }

    if (dto.role) {
      const existing = await this.customFieldRepo.findByTenantIdAndRole(dto.tenantId, dto.role);
      if (existing) {
        throw new DomainError(`Field "${existing.fieldName}" already has the "${dto.role}" role.`);
      }
    }

    const existingFields = await this.customFieldRepo.findByTenantId(dto.tenantId);
    const nextOrder = existingFields.reduce((max, f) => Math.max(max, f.order), -1) + 1;

    const definition = CustomFieldDefinition.create({
      id: randomUUID(),
      tenantId: dto.tenantId,
      fieldName: dto.fieldName,
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
