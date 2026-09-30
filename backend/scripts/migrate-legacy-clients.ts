/**
 * The Slice 14 legacy client migration (FR-CMP-08, NFR-OPS-01): moves
 * existing companies onto the Slice 11/12 model (business type, employee
 * count, area, city, street address, NIPT, website, a primary contact)
 * without losing data, and reports what still needs a human.
 *
 * Idempotent, dry-run by default, and never overwrites a column that
 * already has a value (see `planLegacyClient`). Runs against whichever
 * database `DATABASE_URL` points at (Postgres or MySQL) — the store used
 * here is Prisma-only, with no raw SQL.
 *
 * Usage:
 *   npm run migrate:legacy-clients -- --tenant <slug> --config <file.json> [--report out.csv]
 *       Dry run (the default): plans the migration and writes the CSV
 *       report. Nothing in the database changes.
 *
 *   npm run migrate:legacy-clients -- --tenant <slug> --config <file.json> --apply [--manifest out.json]
 *       Writes the changes and a manifest recording exactly what each
 *       client's write touched, for `--revert`. TAKE A DATABASE BACKUP
 *       FIRST (see deploy/legacy-client-migration.md).
 *
 *   npm run migrate:legacy-clients -- --revert <manifest.json>
 *       Undoes a previous `--apply` run using its manifest.
 */
import { readFileSync, writeFileSync } from 'fs';
import { prisma } from '../src/shared/infrastructure/prisma/client';
import { PrismaLegacyClientMigrationStore } from '../src/clients/infrastructure/legacy/PrismaLegacyClientMigrationStore';
import {
  MigrateLegacyClientsUseCase,
  LegacyMigrationManifest,
  MigrateLegacyClientsResult,
} from '../src/clients/application/use-cases/MigrateLegacyClientsUseCase';
import { RevertLegacyMigrationUseCase } from '../src/clients/application/use-cases/RevertLegacyMigrationUseCase';
import { isLegacyMappingConfig, LegacyMappingConfig } from '../src/clients/domain/legacy/LegacyMappingConfig';
import { LegacyMissingField } from '../src/clients/domain/legacy/LegacyClientPlan';
import { csvRow, UTF8_BOM } from '../src/shared/infrastructure/csv/csvWriter';

const argOf = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
};
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function loadConfig(path: string): LegacyMappingConfig {
  const parsed = JSON.parse(readFileSync(path, 'utf-8'));
  if (!isLegacyMappingConfig(parsed)) {
    throw new Error(`${path} is not a valid legacy mapping config — see scripts/legacy-client-mapping.example.json.`);
  }
  return parsed;
}

const MISSING_LABEL: Record<LegacyMissingField, string> = {
  business_type: 'business type',
  area: 'area',
  city: 'city',
  employee_count: 'employee count',
  contact: 'contact',
};

function writeReport(path: string, result: MigrateLegacyClientsResult): void {
  const header = ['clientId', 'name', 'archived', 'salesperson', 'missing', 'issues'];
  let csv = UTF8_BOM + csvRow(header);
  for (const row of result.rows) {
    csv += csvRow([
      row.clientId,
      row.name,
      row.archived ? 'yes' : 'no',
      row.assignee ?? '',
      row.missing.map((m) => MISSING_LABEL[m]).join('; '),
      row.issues.join(' | '),
    ]);
  }
  writeFileSync(path, csv);
  console.log(`Report written to ${path}.`);
}

function printSummary(result: MigrateLegacyClientsResult, applied: boolean): void {
  console.log(
    `${result.totals.clients} companies, ${result.totals.complete} complete, ${result.totals.needsCompletion} need completion.`
  );
  if (applied) {
    console.log(`Applied: ${result.totals.updated} companies updated, ${result.totals.contactsCreated} contacts created.`);
  } else {
    console.log(`Dry run only — nothing was written. Re-run with --apply to write these changes.`);
  }
  if (result.errors.length > 0) {
    console.log(`${result.errors.length} companies failed and were skipped:`);
    for (const error of result.errors) console.log(`  ${error.clientId}: ${error.message}`);
  }
}

async function runMigration(): Promise<void> {
  const tenant = argOf('tenant');
  const configPath = argOf('config');
  if (!tenant || !configPath) {
    throw new Error('Usage: --tenant <slug> --config <file.json> [--apply] [--report out.csv] [--manifest out.json]');
  }
  const apply = hasFlag('apply');
  const config = loadConfig(configPath);

  if (apply) {
    console.log(`Writing to the database this DATABASE_URL points at. Make sure a backup was taken first.`);
  }

  const useCase = new MigrateLegacyClientsUseCase(new PrismaLegacyClientMigrationStore(prisma));
  const result = await useCase.execute({ tenantSlug: tenant, config, apply });

  writeReport(argOf('report') ?? `legacy-migration-report-${timestamp()}.csv`, result);
  if (apply && result.manifest) {
    const manifestPath = argOf('manifest') ?? `legacy-migration-manifest-${timestamp()}.json`;
    writeFileSync(manifestPath, JSON.stringify(result.manifest, null, 2));
    console.log(`Manifest written to ${manifestPath} — pass it to --revert to undo this run.`);
  }
  printSummary(result, apply);
}

async function runRevert(manifestPath: string): Promise<void> {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as LegacyMigrationManifest;
  console.log(`Reverting ${manifest.entries.length} companies from ${manifestPath} (tenant ${manifest.tenantSlug}).`);

  const useCase = new RevertLegacyMigrationUseCase(new PrismaLegacyClientMigrationStore(prisma));
  const result = await useCase.execute(manifest);

  console.log(`Reverted ${result.reverted} of ${manifest.entries.length} companies.`);
  if (result.errors.length > 0) {
    console.log(`${result.errors.length} companies failed to revert:`);
    for (const error of result.errors) console.log(`  ${error.clientId}: ${error.message}`);
  }
}

async function main(): Promise<void> {
  const revertManifest = argOf('revert');
  if (revertManifest) {
    await runRevert(revertManifest);
  } else {
    await runMigration();
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
