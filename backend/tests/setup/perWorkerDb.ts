import { resolveBaseDatabaseUrl, schemaForWorker, urlForSchema } from './databaseUrl';

/**
 * Runs in every Jest worker BEFORE any test module (and therefore before any
 * `new PrismaClient()`) is loaded, so both the suites' own Prisma clients and
 * the app's singleton in src/shared/infrastructure/prisma/client.ts connect to
 * this worker's private schema.
 *
 * Without this, all workers share one schema: suites use identical hardcoded
 * fixture ids (t1, u1, c1-t1) and some issue unscoped deleteMany({}), so they
 * destroy each other's data and fail non-deterministically under parallelism.
 */
const baseUrl = resolveBaseDatabaseUrl();
const schema = schemaForWorker(process.env.JEST_WORKER_ID ?? '1');

// Prisma's default pool is (cpus * 2 + 1) per client, and a worker holds two
// clients (the suite's own plus the app singleton). Across 8 workers that
// blows past Postgres' default max_connections of 100, and the resulting slow
// connection acquisition shows up as 5s beforeAll hook timeouts rather than as
// an explicit pool error. Cap it so the whole run stays well under the limit.
process.env.DATABASE_URL = urlForSchema(baseUrl, schema, 5);
