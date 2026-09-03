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

  /**
   * Whether this tenant's baseline field set has already been seeded once —
   * see EnsureDefaultClientFieldsUseCase. Lives here rather than on a tenant
   * port because it is purely a fact about the tenant's field definitions:
   * without it, "seed the roles that are missing" makes deleting a roled
   * field impossible, since the next read recreates it.
   */
  hasSeededDefaults(tenantId: string): Promise<boolean>;
  markDefaultsSeeded(tenantId: string): Promise<void>;
}
