import { execFileSync } from 'child_process';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { resolveBaseDatabaseUrl, schemaForWorker, urlForSchema } from './databaseUrl';

const backendRoot = path.resolve(__dirname, '..', '..');

/**
 * Provision one Postgres schema per Jest worker and migrate each to head.
 *
 * `prisma migrate deploy` is a fast no-op once a schema is up to date, so this
 * only costs real time on the first run after a new migration.
 */
export default async function globalSetup(globalConfig: { maxWorkers: number }): Promise<void> {
  const baseUrl = resolveBaseDatabaseUrl();
  const workerCount = Math.max(1, globalConfig.maxWorkers ?? 1);
  const schemas = Array.from({ length: workerCount }, (_, i) => schemaForWorker(i + 1));

  const admin = new PrismaClient({ datasources: { db: { url: baseUrl } } });
  try {
    for (const schema of schemas) {
      await admin.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    }
  } finally {
    await admin.$disconnect();
  }

  await Promise.all(
    schemas.map(async (schema) => {
      execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
        cwd: backendRoot,
        env: { ...process.env, DATABASE_URL: urlForSchema(baseUrl, schema) },
        stdio: 'ignore',
        shell: process.platform === 'win32',
      });
    })
  );
}
