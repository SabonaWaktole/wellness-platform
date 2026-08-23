import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

const backendRoot = path.resolve(__dirname, '..', '..');

/**
 * Resolve the base test database URL.
 *
 * Precedence: an already-exported DATABASE_URL wins (CI), otherwise `.env.test`,
 * otherwise `.env`. dotenv does not override existing vars, so loading both in
 * that order gives the precedence above for free.
 */
export function resolveBaseDatabaseUrl(): string {
  for (const file of ['.env.test', '.env']) {
    const full = path.join(backendRoot, file);
    if (fs.existsSync(full)) {
      dotenv.config({ path: full });
    }
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Export it, or provide backend/.env.test or backend/.env.'
    );
  }
  return url;
}

/** Schema name owned exclusively by a given Jest worker. */
export function schemaForWorker(workerId: string | number): string {
  return `test_w${workerId}`;
}

/** Point a base connection string at a specific Postgres schema. */
export function urlForSchema(baseUrl: string, schema: string, connectionLimit?: number): string {
  const url = new URL(baseUrl);
  url.searchParams.set('schema', schema);
  if (connectionLimit !== undefined) {
    url.searchParams.set('connection_limit', String(connectionLimit));
  }
  return url.toString();
}
