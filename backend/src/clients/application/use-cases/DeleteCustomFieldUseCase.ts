import { AccessContext } from '../../../access/domain/AccessContext';
import { ICustomFieldDefinitionRepository } from '../../domain/repositories/ICustomFieldDefinitionRepository';
import { DomainError } from '../../../shared/domain/errors/DomainError';

interface DeleteCustomFieldDTO {
  tenantId: string;
  access: AccessContext;
  fieldId: string;
}

interface DeleteCustomFieldResult {
  deletedFieldName: string;
  /** Set when the deleted field carried a semantic role, so the caller can
   *  warn about the consequence (e.g. quotation emails stop sending). */
  deletedRole: string | null;
}

export class DeleteCustomFieldUseCase {
  constructor(private customFieldRepo: ICustomFieldDefinitionRepository) {}

  async execute(dto: DeleteCustomFieldDTO): Promise<DeleteCustomFieldResult> {
    dto.access.ensure('settings.manage');

    const existing = await this.customFieldRepo.findById(dto.tenantId, dto.fieldId);
    if (!existing) {
      throw new DomainError('Custom field not found');
    }

    // Deliberately does not touch Client.customFieldValues: the orphaned JSON
    // key is left in place, cheapest option and preserves historical data if
    // a field with the same name is ever recreated.
    await this.customFieldRepo.delete(dto.tenantId, dto.fieldId);

    return { deletedFieldName: existing.fieldName, deletedRole: existing.role };
  }
}
