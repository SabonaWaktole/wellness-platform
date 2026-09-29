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
// clients (the suite's own plus the app singleton) — sometimes three, since a
// handful of integration tests build their own extra PrismaClient on top of
// `createApp()`'s. At 5 each, 8 workers already sustains 60-80 connections
// against Postgres' default max_connections of 100: correctness-safe, but
// with only enough headroom to absorb a couple of workers' connect/disconnect
// transitions overlapping at once. Adding integration test files (each one
// more connect/disconnect transition point across the run) was enough to
// occasionally tip a handful of unrelated, already-marginal tests into
// `FATAL: sorry, too many clients already` under CI's parallel-then-serial
// double full run. 3 keeps the same per-worker isolation with much more
// headroom (8 workers x 9 sustained, comfortably under 100).
process.env.DATABASE_URL = urlForSchema(baseUrl, schema, 3);
