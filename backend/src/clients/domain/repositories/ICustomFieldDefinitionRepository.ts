import { CustomFieldDefinition } from '../entities/CustomFieldDefinition';
import { FieldRole } from '../enums/FieldRole';

export interface ICustomFieldDefinitionRepository {
  /** Ordered by `order` ascending. */
  findByTenantId(tenantId: string): Promise<CustomFieldDefinition[]>;
  findById(tenantId: string, id: string): Promise<CustomFieldDefinition | null>;
  findByTenantIdAndRole(tenantId: string, role: FieldRole): Promise<CustomFieldDefinition | null>;
  save(tenantId: string, definition: CustomFieldDefinition): Promise<void>;
  update(tenantId: string, definition: CustomFieldDefinition): Promise<void>;
  delete(tenantId: string, id: string): Promise<void>;
  /** Writes `order` sequentially (0..n-1) following the given id order. */
  reorder(tenantId: string, orderedIds: string[]): Promise<void>;
}
