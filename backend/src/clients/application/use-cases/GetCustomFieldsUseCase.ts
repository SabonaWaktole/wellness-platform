import { CustomFieldDefinition } from '../../domain/entities/CustomFieldDefinition';
import { EnsureDefaultClientFieldsUseCase } from './EnsureDefaultClientFieldsUseCase';

export class GetCustomFieldsUseCase {
  constructor(private ensureDefaultFields: EnsureDefaultClientFieldsUseCase) {}

  async execute(tenantId: string): Promise<CustomFieldDefinition[]> {
    return this.ensureDefaultFields.execute(tenantId);
  }
}
