import { ICustomFieldDefinitionRepository } from '../../domain/repositories/ICustomFieldDefinitionRepository';
import { UserRole } from '../../../auth/domain/enums/UserRole';
import { DomainError } from '../../../shared/domain/errors/DomainError';

interface ReorderCustomFieldsDTO {
  tenantId: string;
  requestingUserRole: string;
  orderedFieldIds: string[];
}

export class ReorderCustomFieldsUseCase {
  constructor(private customFieldRepo: ICustomFieldDefinitionRepository) {}

  async execute(dto: ReorderCustomFieldsDTO): Promise<void> {
    if (dto.requestingUserRole !== UserRole.BUSINESS_OWNER && dto.requestingUserRole !== UserRole.SUPER_ADMIN) {
      throw new DomainError('Only Business Owners can reorder custom fields');
    }

    const existing = await this.customFieldRepo.findByTenantId(dto.tenantId);
    const existingIds = new Set(existing.map(f => f.id));
    const providedIds = new Set(dto.orderedFieldIds);

    if (existingIds.size !== providedIds.size || [...existingIds].some(id => !providedIds.has(id))) {
      throw new DomainError('Reorder must include every existing field exactly once.');
    }

    await this.customFieldRepo.reorder(dto.tenantId, dto.orderedFieldIds);
  }
}
