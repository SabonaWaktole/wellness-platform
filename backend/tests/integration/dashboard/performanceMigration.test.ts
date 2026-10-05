import { readFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaTenantDeletionTransaction } from '../../../src/tenant/infrastructure/PrismaTenantDeletionTransaction';

const prisma = new PrismaClient();

/**
 * FR-PRF-05, NFR-OPS-03, NFR-DAT-01 on the migrated PostgreSQL schema (M3 Slice 12): the owner on the
 * stage history and the completion date of a follow-up exist, the period indexes exist, and the
 * migration's backfill gives rows from before the slice the deal's current owner and a completed
 * follow-up its last update, and touches nothing else.
 */
describe('Performance migration (M3 Slice 12)', () => {
  const sql = readFileSync(join(__dirname, '../../../prisma/migrations/20261016100000_m3_performance_indexes/migration.sql'), 'utf8');
  const backfills = sql
    .split(';')
    .map((statement) => statement.replace(/^(\s*--.*\n)+/g, '').trim())
    .filter((statement) => /^UPDATE/i.test(statement));

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('NFR-DAT-01 the columns and the period indexes exist', async () => {
    const columns = await prisma.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema() AND ((table_name = 'DealStageHistory' AND column_name = 'ownerUserId') OR (table_name = 'Appointment' AND column_name = 'completedAt'))`
    );
    expect(columns).toHaveLength(2);
    const indexes = (
      await prisma.$queryRawUnsafe<{ indexname: string }[]>(`SELECT indexname FROM pg_indexes WHERE schemaname = current_schema()`)
    ).map((row) => row.indexname);
    for (const name of [
      'DealStageHistory_tenantId_ownerUserId_toStage_at_idx',
      'Deal_tenantId_wonAt_idx',
      'Deal_tenantId_lostAt_idx',
      'Interaction_tenantId_authorUserId_occurredAt_idx',
      'Quotation_tenantId_sentAt_idx',
      'Appointment_tenantId_completedAt_idx',
    ]) {
      expect(indexes).toContain(name);
    }
  });

  it('NFR-OPS-03 the backfill gives old history rows the deal owner and old completed follow-ups their last update, once', async () => {
    expect(backfills).toHaveLength(2);
    const tenantId = `t-permig-${randomUUID()}`;
    const user = `u-permig-${randomUUID()}`;
    const other = `u-permig2-${randomUUID()}`;
    await prisma.tenant.create({ data: { id: tenantId, name: 'Migration tenant', urlSlug: tenantId } });
    try {
      await prisma.user.createMany({
        data: [user, other].map((id) => ({ id, email: `${id}@example.com`, hashedPassword: 'x', role: 'STAFF', tenantId, firstName: 'M', lastName: 'M' })),
      });
      const clientId = randomUUID();
      await prisma.client.create({ data: { id: clientId, tenantId, name: 'Old', customFieldValues: {}, lastUpdatedByUserId: user, assignedUserId: user } as any });
      const dealId = randomUUID();
      await prisma.deal.create({ data: { id: dealId, tenantId, clientId, ownerUserId: user, createdByUserId: user, type: 'NEW_CONTRACT', stageKey: 'WON' } as any });
      const [oldRow, newRow] = [randomUUID(), randomUUID()];
      await prisma.dealStageHistory.create({ data: { id: oldRow, tenantId, dealId, toStage: 'WON' } });
      // Written after the slice, with its own owner: the backfill must not touch it.
      await prisma.dealStageHistory.create({ data: { id: newRow, tenantId, dealId, toStage: 'WON', ownerUserId: other } });
      const updated = new Date('2026-09-10T10:00:00Z');
      const base = { tenantId, clientId, assignedUserId: user, scheduledAt: updated, kind: 'FOLLOW_UP', type: 'CALL' };
      const [done, open, planned] = [randomUUID(), randomUUID(), randomUUID()];
      await prisma.appointment.create({ data: { id: done, ...base, status: 'COMPLETED', updatedAt: updated } as any });
      await prisma.appointment.create({ data: { id: open, ...base, status: 'SCHEDULED' } as any });
      await prisma.appointment.create({ data: { id: planned, ...base, kind: 'PLANNED', status: 'COMPLETED' } as any });
      // `updatedAt` is set by Prisma on create, so move it back with SQL.
      await prisma.$executeRawUnsafe(`UPDATE "Appointment" SET "updatedAt" = $1::timestamp WHERE "id" = $2`, '2026-09-10 10:00:00', done);

      for (let run = 0; run < 2; run++) for (const statement of backfills) await prisma.$executeRawUnsafe(statement);

      expect((await prisma.dealStageHistory.findUniqueOrThrow({ where: { id: oldRow } })).ownerUserId).toBe(user);
      expect((await prisma.dealStageHistory.findUniqueOrThrow({ where: { id: newRow } })).ownerUserId).toBe(other);
      expect((await prisma.appointment.findUniqueOrThrow({ where: { id: done } })).completedAt).toEqual(updated);
      expect((await prisma.appointment.findUniqueOrThrow({ where: { id: open } })).completedAt).toBeNull();
      expect((await prisma.appointment.findUniqueOrThrow({ where: { id: planned } })).completedAt).toBeNull();
    } finally {
      await new PrismaTenantDeletionTransaction(prisma).run(tenantId);
    }
  });
});
