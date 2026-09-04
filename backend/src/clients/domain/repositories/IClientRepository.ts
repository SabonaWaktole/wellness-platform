import { Client } from '../entities/Client';
import { FieldRole } from '../enums/FieldRole';

export interface SearchClientsFilters {
  /**
   * Combined free-text term, matched case-insensitively against name, email and
   * phone with OR. This backs the single search box the SRS asks for:
   * "Search by name, contact number, or email."
   */
  search?: string;
  /** Field-specific filters, for callers that want to target one column. */
  name?: string;
  email?: string;
  phone?: string;
  assignedUserId?: string;
  status?: string;
  customFields?: Record<string, any>;
}

export interface IClientRepository {
  findById(tenantId: string, id: string): Promise<Client | null>;
  search(tenantId: string, filters: SearchClientsFilters, skip: number, take: number): Promise<{ items: Client[]; total: number }>;
  countByTenant(tenantId: string, createdBefore?: Date): Promise<number>;
  findRecentByTenant(tenantId: string, limit: number, assignedUserId?: string): Promise<Client[]>;
  save(tenantId: string, client: Client): Promise<void>;
  update(tenantId: string, client: Client): Promise<void>;
  /**
   * One-time merge of the legacy name/email/phone/status/assignedUserId
   * columns into customFieldValues under the given newly-seeded field
   * names, for every existing client of the tenant. Safe to call only when
   * those field names are guaranteed absent from customFieldValues (i.e.
   * right after the definitions were created) — see
   * EnsureDefaultClientFieldsUseCase.
   */
  backfillLegacyBasicFields(tenantId: string, fieldNameByRole: Partial<Record<FieldRole, string>>): Promise<void>;
}
