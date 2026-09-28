import { AccessContext } from '../../../access/domain/AccessContext';
import { ICustomFieldDefinitionRepository } from '../../domain/repositories/ICustomFieldDefinitionRepository';
import { DomainError } from '../../../shared/domain/errors/DomainError';

interface ReorderCustomFieldsDTO {
  tenantId: string;
  access: AccessContext;
  orderedFieldIds: string[];
}

export class ReorderCustomFieldsUseCase {
  constructor(private customFieldRepo: ICustomFieldDefinitionRepository) {}

  async execute(dto: ReorderCustomFieldsDTO): Promise<void> {
    dto.access.ensure('settings.manage');

    const existing = await this.customFieldRepo.findByTenantId(dto.tenantId);
    const existingIds = new Set(existing.map(f => f.id));
    const providedIds = new Set(dto.orderedFieldIds);

    if (existingIds.size !== providedIds.size || [...existingIds].some(id => !providedIds.has(id))) {
      throw new DomainError('Reorder must include every existing field exactly once.');
    }

    await this.customFieldRepo.reorder(dto.tenantId, dto.orderedFieldIds);
  }
}
