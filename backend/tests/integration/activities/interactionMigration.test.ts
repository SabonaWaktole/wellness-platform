import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import * as path from 'path';
import { Prisma, PrismaClient } from '@prisma/client';
import { DEFAULT_ACTIVITY_RESULTS } from '../../../src/lookups/domain/DefaultLookups';

const prisma = new PrismaClient();

const MIGRATION = path.resolve(__dirname, '../../../prisma/migrations/20261002100000_m2_activities/migration.sql');

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
 * M2 Slice 7, decision D5: interactions recorded before Slice 7 become
 * activities. This replays the migration's data statements on rows planted
 * the way they were before it (no `occurredAt`, no result), independently of
 * whether the migration already ran against this database. The MySQL script
 * is proved the same way by the `mysql` CI job (prisma/ci/).
 */
describe('FR-ACT-07 NFR-OPS-02 legacy interaction migration (D5)', () => {
  const tenantId = `t-act-migration-${randomUUID()}`;
  const userId = `u-act-migration-${randomUUID()}`;
  const clientId = `c-act-migration-${randomUUID()}`;
  const legacyCategoryId = `oc-legacy-${randomUUID()}`;
  const defaultCategoryId = `oc-default-${randomUUID()}`;
  const ids = { call: `i-call-${randomUUID()}`, meeting: `i-meeting-${randomUUID()}`, note: `i-note-${randomUUID()}` };
  const createdAt = {
    call: new Date('2026-03-01T09:15:00.000Z'),
    meeting: new Date('2026-04-02T10:30:00.000Z'),
    note: new Date('2026-05-03T11:45:00.000Z'),
  };
  const notReached = DEFAULT_ACTIVITY_RESULTS[2].nameSq;

  beforeAll(async () => {
    await prisma.tenant.create({ data: { id: tenantId, name: 'Activity migration tenant', urlSlug: tenantId } });
    await prisma.user.create({ data: { id: userId, email: `${userId}@example.com`, hashedPassword: 'x', role: 'STAFF', tenantId } });
    await prisma.client.create({ data: { id: clientId, tenantId, name: 'Legacy Co', customFieldValues: {}, lastUpdatedByUserId: userId } });
    await prisma.outcomeCategory.createMany({
      data: [
        { id: legacyCategoryId, tenantId, label: 'Interested (legacy)' },
        // The same label as a default: it must map to the default, not be copied twice.
        { id: defaultCategoryId, tenantId, label: notReached },
      ],
    });
    const legacy = (id: string, channel: string, at: Date, outcomeCategoryId: string | null) => ({
      id, tenantId, clientId, authorUserId: userId, content: `Legacy ${channel}`, channel, outcomeCategoryId, createdAt: at,
    });
    await prisma.interaction.createMany({
      data: [
        legacy(ids.call, 'CALL', createdAt.call, legacyCategoryId),
        legacy(ids.meeting, 'MEETING', createdAt.meeting, defaultCategoryId),
        legacy(ids.note, 'NOTE', createdAt.note, null),
      ],
    });
  });

  afterAll(async () => {
    await prisma.interaction.deleteMany({ where: { tenantId } });
    await prisma.activityResult.deleteMany({ where: { tenantId } });
    await prisma.outcomeCategory.deleteMany({ where: { tenantId } });
    await prisma.client.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  const interactions = (tx: Prisma.TransactionClient) =>
    tx.interaction.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } });

  it('keeps every interaction and dates each one by its creation', async () => {
    await afterMigration(1, async (tx) => {
      const rows = await interactions(tx);
      expect(rows.map((row) => row.id)).toEqual([ids.call, ids.meeting, ids.note]);
      expect(rows.map((row) => row.occurredAt?.toISOString())).toEqual([createdAt.call, createdAt.meeting, createdAt.note].map((at) => at.toISOString()));
      // The old column stays until Milestone 3; the new ones are left empty.
      expect(rows.map((row) => row.outcomeCategoryId)).toEqual([legacyCategoryId, defaultCategoryId, null]);
      expect(rows.every((row) => row.contactPersonId === null && row.dealId === null && row.clientFeedback === null && row.nextAction === null)).toBe(true);
    });
  });

  it('gives the workspace the default results plus its own labels, and maps every result', async () => {
    await afterMigration(1, async (tx) => {
      const results = await tx.activityResult.findMany({ where: { tenantId }, orderBy: { order: 'asc' } });
      expect(results.map((result) => [result.nameSq, result.order])).toEqual([
        ...DEFAULT_ACTIVITY_RESULTS.map((result, index) => [result.nameSq, index + 1]),
        ['Interested (legacy)', 7],
      ]);
      const copied = results.find((result) => result.nameSq === 'Interested (legacy)')!;
      expect(copied.id).toBe(legacyCategoryId);
      const defaultMatch = results.find((result) => result.nameSq === notReached)!;

      const rows = await interactions(tx);
      expect(rows.map((row) => row.resultId)).toEqual([legacyCategoryId, defaultMatch.id, null]);
    });
  });

  it('changes nothing when it runs again', async () => {
    await afterMigration(2, async (tx) => {
      expect(await tx.interaction.count({ where: { tenantId } })).toBe(3);
      expect(await tx.activityResult.count({ where: { tenantId } })).toBe(DEFAULT_ACTIVITY_RESULTS.length + 1);
      expect(await tx.interaction.count({ where: { tenantId, occurredAt: null } })).toBe(0);
    });
  });
});
