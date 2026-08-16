import { execFileSync } from 'child_process';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { resolveBaseDatabaseUrl, databaseForWorker, urlForDatabase } from './databaseUrl';

const backendRoot = path.resolve(__dirname, '..', '..');

/**
 * Provision one MySQL database per Jest worker and migrate each to head.
 *
 * `prisma migrate deploy` is a fast no-op once a database is up to date, so
 * this only costs real time on the first run after a new migration.
 */
export default async function globalSetup(globalConfig: { maxWorkers: number }): Promise<void> {
  const baseUrl = resolveBaseDatabaseUrl();
  const workerCount = Math.max(1, globalConfig.maxWorkers ?? 1);
  const databases = Array.from({ length: workerCount }, (_, i) => databaseForWorker(i + 1));

  const admin = new PrismaClient({ datasources: { db: { url: baseUrl } } });
  try {
    for (const database of databases) {
      // Backticks, not double quotes: MySQL reads "x" as a string literal
      // rather than an identifier unless ANSI_QUOTES is set, so a
      // double-quoted CREATE DATABASE is a syntax error here.
      await admin.$executeRawUnsafe(`CREATE DATABASE IF NOT EXISTS \`${database}\``);
    }
  } finally {
    await admin.$disconnect();
  }

  await Promise.all(
    databases.map(async (database) => {
      execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
        cwd: backendRoot,
        env: { ...process.env, DATABASE_URL: urlForDatabase(baseUrl, database) },
        stdio: 'ignore',
        shell: process.platform === 'win32',
      });
    })
  );
}
