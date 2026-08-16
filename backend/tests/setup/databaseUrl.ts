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

/**
 * Name of the database owned exclusively by a given Jest worker.
 *
 * MySQL has no schemas-within-a-database: `CREATE SCHEMA` is a synonym for
 * `CREATE DATABASE`, and a connection selects one via the URL path rather than
 * a `?schema=` parameter. So worker isolation is one whole database each,
 * where under Postgres it was one schema inside a shared database.
 */
export function databaseForWorker(workerId: string | number): string {
  return `test_w${workerId}`;
}

/**
 * Point a base connection string at a specific database.
 *
 * The database is the URL's path segment. Setting `?schema=` here instead —
 * as the Postgres version did — is silently ignored by the MySQL connector,
 * which would leave every worker sharing one database and reintroduce exactly
 * the cross-worker clobbering this isolation exists to prevent.
 */
export function urlForDatabase(
  baseUrl: string,
  database: string,
  connectionLimit?: number
): string {
  const url = new URL(baseUrl);
  url.pathname = `/${database}`;
  if (connectionLimit !== undefined) {
    url.searchParams.set('connection_limit', String(connectionLimit));
  }
  return url.toString();
}
