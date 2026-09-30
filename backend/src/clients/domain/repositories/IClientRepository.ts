import { RecordScope } from '../../../access/domain/RecordScope';
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
  /** Slice 11 filters (FR-CMP-06). `riskLevelId` narrows through the business type. */
  businessTypeId?: string;
  riskLevelId?: string;
  areaId?: string;
  cityId?: string;
  /**
   * Slice 14 (FR-CMP-08): `true` narrows to companies still missing a
   * business type, employee count, area, city or a live contact — the same
   * gaps the legacy migration's CSV report lists. Applied inside the query
   * (a `NOT EXISTS` for the contact check), so counts and pagination stay
   * correct alongside every other filter.
   */
  needsCompletion?: boolean;
  /**
   * Which side of the soft-delete line to search. Defaults to `false` —
   * active clients only — so every existing caller keeps its current
   * behaviour without change. `true` returns ONLY archived clients, which is
   * what the Clients page's "Archived" view asks for.
   */
  archived?: boolean;
  /**
   * The viewer's reach (FR-RBAC-11..13), applied in the query so counts and
   * pagination match what they may see. Omitted means every client — for
   * system callers only; every user-facing read passes one.
   */
  scope?: RecordScope;
}

export interface FindClientOptions {
  includeArchived?: boolean;
  /** Outside the scope reads as not found (FR-RBAC-05: 404, not 403). */
  scope?: RecordScope;
}

/** What an archive would leave behind — shown in the confirmation dialog. */
export interface ClientRelatedCounts {
  interactions: number;
  appointments: number;
  quotations: number;
  invoices: number;
}

export interface IClientRepository {
  /** Another active company of this tenant with this name, other than `excludeId` (FR-CMP-02: a warning, not an error). */
  countByName(tenantId: string, name: string, excludeId?: string): Promise<number>;
  /** Another company of this tenant already holding this NIPT, other than `excludeId` (Q8). */
  findByTaxId(tenantId: string, taxId: string, excludeId?: string): Promise<Client | null>;
  /**
   * Active clients only unless `includeArchived` is set. The option exists for
   * the archive/restore paths, which must be able to load a client that
   * ordinary reads deliberately hide.
   */
  findById(tenantId: string, id: string, options?: FindClientOptions): Promise<Client | null>;
  search(tenantId: string, filters: SearchClientsFilters, skip: number, take: number): Promise<{ items: Client[]; total: number }>;
  countByTenant(tenantId: string, createdBefore?: Date): Promise<number>;
  findRecentByTenant(tenantId: string, limit: number, scope?: RecordScope): Promise<Client[]>;
  save(tenantId: string, client: Client): Promise<void>;
  update(tenantId: string, client: Client): Promise<void>;
  /** Stamps `deletedAt`, hiding the client from every client-facing read. */
  archive(tenantId: string, id: string, archivedByUserId: string): Promise<void>;
  /** Clears `deletedAt`, bringing an archived client back. */
  restore(tenantId: string, id: string, restoredByUserId: string): Promise<void>;
  /** Counts the records that would be left dangling by a hard delete, so the
   *  UI can tell the owner what archiving preserves. */
  countRelatedRecords(tenantId: string, id: string): Promise<ClientRelatedCounts>;
  /**
   * One-time merge of the legacy name/email/phone/status/assignedUserId
   * columns into customFieldValues under the given newly-seeded field
   * names, for every existing client of the tenant. Safe to call only when
   * those field names are guaranteed absent from customFieldValues (i.e.
   * right after the definitions were created) — see
   * EnsureDefaultClientFieldsUseCase.
   */
  backfillLegacyBasicFields(tenantId: string, fieldNameByRole: Partial<Record<FieldRole, string>>): Promise<void>;
  /**
   * Renames a key inside every client's `customFieldValues` for this tenant,
   * from the field's old name to its new one — the JSON-column counterpart of
   * an ALTER TABLE RENAME COLUMN.
   *
   * Without this, UpdateCustomFieldUseCase changes CustomFieldDefinition.fieldName
   * while every stored value stays under the OLD key, so the field reads back
   * empty for every existing client the moment it's renamed. That was a latent
   * bug when renames only happened from a settings table; a canvas editor where
   * editing a label is the primary interaction turns it into routine data loss.
   *
   * A no-op (not an error) when `from` and `to` are equal, or when `from` does
   * not appear as a key on any client — most clients never had this field set.
   */
  renameCustomFieldKey(tenantId: string, from: string, to: string): Promise<void>;
}
