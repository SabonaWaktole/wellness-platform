/**
 * Single source of truth for which database is live. `prisma generate` bakes
 * the provider into the client at build time, but raw SQL (`$queryRaw`) isn't
 * validated against the schema the way typed queries are, so any file writing
 * raw SQL has to branch on this itself instead of relying on a compile error
 * to catch a Postgres-only query running against MySQL.
 */
export const IS_MYSQL = (process.env.DATABASE_URL ?? '').startsWith('mysql://');
