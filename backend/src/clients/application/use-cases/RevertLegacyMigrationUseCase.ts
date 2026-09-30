import { ILegacyClientMigrationStore } from '../ports/ILegacyClientMigrationStore';
import { LegacyMigrationManifest } from './MigrateLegacyClientsUseCase';

export interface RevertLegacyMigrationResult {
  reverted: number;
  errors: { clientId: string; message: string }[];
}

/**
 * Undoes a previous `--apply` run from its manifest (FR-CMP-08, NFR-OPS-01
 * rollback path), one client at a time. A client that fails to revert is
 * recorded and skipped, same as `MigrateLegacyClientsUseCase.execute` — a
 * partial revert is reported, never silently swallowed or fatal to the rest.
 */
export class RevertLegacyMigrationUseCase {
  constructor(private readonly store: ILegacyClientMigrationStore) {}

  async execute(manifest: LegacyMigrationManifest): Promise<RevertLegacyMigrationResult> {
    let reverted = 0;
    const errors: { clientId: string; message: string }[] = [];

    for (const entry of manifest.entries) {
      try {
        await this.store.revertClient(manifest.tenantId, entry.clientId, entry.profilePatch, entry.contactCreatedId);
        reverted += 1;
      } catch (error) {
        errors.push({ clientId: entry.clientId, message: error instanceof Error ? error.message : String(error) });
      }
    }

    return { reverted, errors };
  }
}
