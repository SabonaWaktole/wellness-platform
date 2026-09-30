import { ILegacyClientMigrationStore } from '../ports/ILegacyClientMigrationStore';
import { LegacyMappingConfig } from '../../domain/legacy/LegacyMappingConfig';
import { LegacyClientSnapshot, LegacyMissingField, planLegacyClient } from '../../domain/legacy/LegacyClientPlan';
import { CompanyProfileData } from '../../domain/value-objects/CompanyProfile';

interface MigrateLegacyClientsDTO {
  tenantSlug: string;
  config: LegacyMappingConfig;
  /** false (the default in the script) plans and reports without writing anything. */
  apply: boolean;
}

export interface LegacyMigrationReportRow {
  clientId: string;
  name: string;
  archived: boolean;
  assignee: string | null;
  missing: LegacyMissingField[];
  issues: string[];
}

export interface LegacyMigrationManifestEntry {
  clientId: string;
  profilePatch: Partial<CompanyProfileData>;
  contactCreatedId: string | null;
}

export interface LegacyMigrationManifest {
  tenantId: string;
  tenantSlug: string;
  generatedAt: string;
  entries: LegacyMigrationManifestEntry[];
}

export interface MigrateLegacyClientsResult {
  totals: {
    clients: number;
    updated: number;
    contactsCreated: number;
    complete: number;
    needsCompletion: number;
  };
  rows: LegacyMigrationReportRow[];
  /** `null` on a dry run — nothing was written, so there is nothing to revert. */
  manifest: LegacyMigrationManifest | null;
  errors: { clientId: string; message: string }[];
}

/**
 * Plans, and optionally applies, the Slice 14 legacy migration for one
 * tenant (FR-CMP-08). Always dry-runs the plan first — the report and totals
 * are the same whether or not `apply` is set — and only writes when `apply`
 * is true. A client whose write fails is recorded in `errors` and does not
 * stop the rest of the run (NFR-OPS-01: one bad row must not abort a
 * migration over thousands of companies).
 */
export class MigrateLegacyClientsUseCase {
  constructor(private readonly store: ILegacyClientMigrationStore) {}

  async execute(dto: MigrateLegacyClientsDTO): Promise<MigrateLegacyClientsResult> {
    const context = await this.store.loadTenantContext(dto.tenantSlug);
    const clients = await this.store.listClients(context.tenantId);

    // Claims a taxId for the run as soon as a plan assigns it, so two legacy
    // clients that would otherwise map to the same NIPT in the same run
    // don't both claim it — the second is reported as taken, not written.
    const taxIdsClaimed = new Set(
      clients.map((client) => client.profile.taxId).filter((taxId): taxId is string => !!taxId)
    );

    const rows: LegacyMigrationReportRow[] = [];
    const entries: LegacyMigrationManifestEntry[] = [];
    const errors: { clientId: string; message: string }[] = [];
    let contactsCreated = 0;
    let updated = 0;

    for (const client of clients) {
      const snapshot: LegacyClientSnapshot = {
        id: client.id,
        name: client.name,
        email: client.email,
        phone: client.phone,
        customFieldValues: client.customFieldValues,
        profile: client.profile,
        hasLiveContact: client.hasLiveContact,
        archived: client.archived,
      };

      const plan = planLegacyClient(snapshot, dto.config, {
        businessTypes: context.businessTypes,
        areas: context.areas,
        cities: context.cities,
        fieldDefs: context.fieldDefs,
        taxIdsInUse: taxIdsClaimed,
      });

      if (plan.profilePatch.taxId) taxIdsClaimed.add(plan.profilePatch.taxId);

      rows.push({
        clientId: client.id,
        name: client.name,
        archived: client.archived,
        assignee: client.assigneeLabel,
        missing: plan.missing,
        issues: plan.issues,
      });

      const hasWork = Object.keys(plan.profilePatch).length > 0 || plan.contactToCreate !== null;
      if (!dto.apply || !hasWork) continue;

      try {
        const applied = await this.store.applyClient(context.tenantId, client.id, plan.profilePatch, plan.contactToCreate);
        entries.push({
          clientId: client.id,
          profilePatch: applied.profilePatch,
          contactCreatedId: applied.contactCreatedId,
        });
        updated += 1;
        if (applied.contactCreatedId) contactsCreated += 1;
      } catch (error) {
        errors.push({ clientId: client.id, message: error instanceof Error ? error.message : String(error) });
      }
    }

    const complete = rows.filter((row) => row.missing.length === 0).length;

    return {
      totals: {
        clients: clients.length,
        updated,
        contactsCreated,
        complete,
        needsCompletion: rows.length - complete,
      },
      rows,
      manifest: dto.apply
        ? { tenantId: context.tenantId, tenantSlug: dto.tenantSlug, generatedAt: new Date().toISOString(), entries }
        : null,
      errors,
    };
  }
}
