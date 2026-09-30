import { prisma } from '../../src/shared/infrastructure/prisma/client';

/**
 * Every test file gets its own module registry, and with it its own instance
 * of the app's shared PrismaClient (src/shared/infrastructure/prisma/client.ts),
 * which nothing disconnected. Under `--runInBand` one process runs every file,
 * so each file's pool stayed open until the run ended: the serial pass peaked
 * above Postgres' default max_connections of 100 and failed unrelated suites
 * with "remaining connection slots are reserved". Releasing the pool after
 * each file keeps the serial run at a few connections. A client that never
 * connected (every unit test) disconnects as a no-op; one the file's own
 * afterAll still queries simply reconnects.
 */
afterAll(async () => {
  await prisma.$disconnect();
});
