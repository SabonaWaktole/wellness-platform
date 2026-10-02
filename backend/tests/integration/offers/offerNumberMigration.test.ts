import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import * as path from 'path';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MIGRATION = path.resolve(__dirname, '../../../prisma/migrations/20261004100000_m2_offer_documents/migration.sql');

/**
 * The data section of the migration, one statement at a time (Prisma runs one
 * statement per call). A `DO $$ … $$;` block is one statement even though its
 * body has semicolons.
 */
function dataStatements(): string[] {
  const sql = readFileSync(MIGRATION, 'utf8');
  const start = sql.indexOf('-- BEGIN DATA');
  const end = sql.indexOf('-- END DATA');
  if (start < 0 || end < start) throw new Error('the migration has no BEGIN DATA / END DATA section');
  const statements: string[] = [];
  let current: string[] = [];
  for (const line of sql.slice(start, end).split('\n')) {
    if (current.length === 0 && (line.trim() === '' || line.trim().startsWith('--'))) continue;
    current.push(line);
    const text = current.join('\n');
    const insideDollarQuote = (text.match(/\$\$/g)?.length ?? 0) % 2 === 1;
    if (line.trimEnd().endsWith(';') && !insideDollarQuote) {
      statements.push(text);
      current = [];
    }
  }
  return statements;
}

class Rollback extends Error {}

/**
 * Runs `check` after the migration's data statements, inside a transaction
 * that is always rolled back: the statements touch every workspace in this
 * worker's schema, and nothing they do may outlive the test.
 */
async function afterMigration(times: number, check: (tx: Prisma.TransactionClient) => Promise<void>) {
  const statements = dataStatements();
  await expect(
    prisma.$transaction(async (tx) => {
      for (let run = 0; run < times; run += 1) {
        for (const statement of statements) await tx.$executeRawUnsafe(statement);
      }
      await check(tx);
      throw new Rollback();
    }, { timeout: 30_000 })
  ).rejects.toBeInstanceOf(Rollback);
}

/**
 * M2 Slice 9, decision D5: quotations created before Slice 9 get their
 * numbers. This replays the migration's data statements on rows planted with
 * no number, independently of whether the migration already ran against this
 * database. The MySQL script is proved the same way by the `mysql` CI job
 * (prisma/ci/mysql_check_offer_numbers.sql).
 */
describe('FR-OFR-08 NFR-OPS-02 quotation reference migration (D5)', () => {
  const tenantId = `t-ofr-migration-${randomUUID()}`;
  const prefixedTenantId = `t-ofr-migration-wa-${randomUUID()}`;
  const userId = `u-ofr-migration-${randomUUID()}`;
  const prefixedUserId = `u-ofr-migration-wa-${randomUUID()}`;
  const clientId = `c-ofr-migration-${randomUUID()}`;
  const prefixedClientId = `c-ofr-migration-wa-${randomUUID()}`;
  const ids = {
    q2025a: `q-2025a-${randomUUID()}`,
    q2025b: `q-2025b-${randomUUID()}`,
    q2026a: `q-2026a-${randomUUID()}`,
    q2026b: `q-2026b-${randomUUID()}`,
    prefixed: `q-wa-${randomUUID()}`,
  };

  beforeAll(async () => {
    await prisma.tenant.createMany({
      data: [
        { id: tenantId, name: 'Quotation migration tenant', urlSlug: tenantId },
        { id: prefixedTenantId, name: 'Prefixed quotation migration tenant', urlSlug: prefixedTenantId },
      ],
    });
    await prisma.user.createMany({
      data: [
        { id: userId, email: `${userId}@example.com`, hashedPassword: 'x', role: 'STAFF', tenantId },
        { id: prefixedUserId, email: `${prefixedUserId}@example.com`, hashedPassword: 'x', role: 'STAFF', tenantId: prefixedTenantId },
      ],
    });
    await prisma.client.createMany({
      data: [
        { id: clientId, tenantId, name: 'Legacy Co', customFieldValues: {}, lastUpdatedByUserId: userId },
        { id: prefixedClientId, tenantId: prefixedTenantId, name: 'Prefixed Co', customFieldValues: {}, lastUpdatedByUserId: prefixedUserId },
      ],
    });
    await prisma.pricingSettings.create({ data: { tenantId: prefixedTenantId, offerNumberPrefix: 'WA' } });
    // The 2026 counter has already handed out two numbers.
    await prisma.documentSequence.create({ data: { tenantId, kind: 'OFFER', year: 2026, next: 3 } });
    const legacy = (id: string, at: string, status: string, tenant = tenantId, client = clientId, user = userId) => ({
      id, tenantId: tenant, clientId: client, createdByUserId: user, status, createdAt: new Date(at),
    });
    // Planted out of order: numbers follow createdAt, not insertion.
    await prisma.quotation.createMany({
      data: [
        legacy(ids.q2026b, '2026-03-01T10:00:00.000Z', 'SENT'),
        legacy(ids.q2025a, '2025-02-01T10:00:00.000Z', 'ACCEPTED'),
        legacy(ids.q2026a, '2026-01-10T10:00:00.000Z', 'DRAFT'),
        legacy(ids.q2025b, '2025-06-01T10:00:00.000Z', 'EXPIRED'),
        legacy(ids.prefixed, '2026-05-05T10:00:00.000Z', 'DRAFT', prefixedTenantId, prefixedClientId, prefixedUserId),
      ],
    });
  });

  afterAll(async () => {
    const tenants = [tenantId, prefixedTenantId];
    await prisma.quotation.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.documentSequence.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.pricingSettings.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.client.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenants } } });
    await prisma.$disconnect();
  });

  const numbers = async (tx: Prisma.TransactionClient) =>
    Object.fromEntries(
      (await tx.quotation.findMany({ where: { id: { in: Object.values(ids) } }, select: { id: true, number: true, version: true } })).map(
        (row) => [row.id, `${row.number} v${row.version}`]
      )
    );
  const counters = (tx: Prisma.TransactionClient) =>
    tx.documentSequence.findMany({ where: { tenantId }, orderBy: { year: 'asc' }, select: { year: true, next: true } });

  it('numbers every quotation once, per year, in createdAt order, continuing the counter', async () => {
    await afterMigration(1, async (tx) => {
      expect(await numbers(tx)).toEqual({
        [ids.q2025a]: 'OF-2025-0001 v1',
        [ids.q2025b]: 'OF-2025-0002 v1',
        [ids.q2026a]: 'OF-2026-0003 v1',
        [ids.q2026b]: 'OF-2026-0004 v1',
        [ids.prefixed]: 'WA-2026-0001 v1',
      });
      expect(await counters(tx)).toEqual([
        { year: 2025, next: 3 },
        { year: 2026, next: 5 },
      ]);
    });
  });

  it('changes nothing when it runs again', async () => {
    await afterMigration(2, async (tx) => {
      expect((await numbers(tx))[ids.q2026b]).toBe('OF-2026-0004 v1');
      expect(await counters(tx)).toEqual([
        { year: 2025, next: 3 },
        { year: 2026, next: 5 },
      ]);
    });
  });

  it('switches only the Wellness Albania workspace to the sales process (D6)', async () => {
    await afterMigration(0, async (tx) => {
      // Planted inside the rolled-back transaction; the slug is unique, so an
      // existing workspace with it is reset instead.
      const existing = await tx.tenant.findUnique({ where: { urlSlug: 'wellness-albania' }, select: { id: true } });
      const wellness = existing?.id ?? `t-ofr-migration-wellness-${randomUUID()}`;
      if (existing) await tx.tenant.update({ where: { id: wellness }, data: { salesWorkflow: 'LEGACY_QUOTATIONS' } });
      else await tx.tenant.create({ data: { id: wellness, name: 'Wellness Albania', urlSlug: 'wellness-albania' } });
      for (const statement of dataStatements()) await tx.$executeRawUnsafe(statement);
      const rows = await tx.tenant.findMany({ where: { id: { in: [wellness, tenantId] } }, select: { id: true, salesWorkflow: true } });
      expect(Object.fromEntries(rows.map((row) => [row.id, row.salesWorkflow]))).toEqual({
        [wellness]: 'SALES_PROCESS',
        [tenantId]: 'LEGACY_QUOTATIONS',
      });
    });
  });
});
