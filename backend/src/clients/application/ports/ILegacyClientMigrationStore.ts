import { BusinessType, Area, City } from '../../../lookups/domain/LookupItem';
import { CustomFieldDefinition } from '../../domain/entities/CustomFieldDefinition';
import { CompanyProfileData } from '../../domain/value-objects/CompanyProfile';
import { PlannedContact } from '../../domain/legacy/LegacyClientPlan';

export interface LegacyMigrationTenantContext {
  tenantId: string;
  fieldDefs: CustomFieldDefinition[];
  businessTypes: BusinessType[];
  areas: Area[];
  cities: City[];
}

export interface LegacyMigrationClientRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  customFieldValues: Record<string, unknown>;
  profile: CompanyProfileData;
  hasLiveContact: boolean;
  archived: boolean;
  /** The assigned salesperson's email, for the CSV report — null when unassigned. */
  assigneeLabel: string | null;
}

export interface AppliedClientChange {
  clientId: string;
  profilePatch: Partial<CompanyProfileData>;
  contactCreatedId: string | null;
}

/**
 * The Slice 14 migration's persistence port (FR-CMP-08). Every method takes
 * `tenantId` first, per the multi-tenancy rule. `applyClient` and
 * `revertClient` each run in one transaction per client, so a failure on one
 * company never leaves a half-written row and never blocks the rest of the
 * run (the use case catches per-client errors and continues).
 */
export interface ILegacyClientMigrationStore {
  /** Resolves the tenant and loads everything the plan needs to run, once per run. */
  loadTenantContext(tenantSlug: string): Promise<LegacyMigrationTenantContext>;
  /** Every client of the tenant, archived ones included (flagged), oldest first for a stable, repeatable run order. */
  listClients(tenantId: string): Promise<LegacyMigrationClientRow[]>;
  /**
   * Writes only the columns in `patch` (each guarded by `WHERE <col> IS
   * NULL` at the infrastructure layer, so a concurrent edit is never
   * clobbered) and creates `contact` as the company's primary contact when
   * given, all in one transaction with one system-actor audit entry.
   */
  applyClient(
    tenantId: string,
    clientId: string,
    patch: Partial<CompanyProfileData>,
    contact: PlannedContact | null
  ): Promise<AppliedClientChange>;
  /**
   * Undoes exactly what `applyClient` wrote for this client: resets each
   * patched column to null (only if it still holds the value the migration
   * wrote) and removes the contact the migration created, if any — audited
   * the same way.
   */
  revertClient(
    tenantId: string,
    clientId: string,
    patch: Partial<CompanyProfileData>,
    contactCreatedId: string | null
  ): Promise<void>;
}
