import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaTenantDeletionTransaction } from '../../../src/tenant/infrastructure/PrismaTenantDeletionTransaction';
import { PrismaContractRepository } from '../../../src/contracts/infrastructure/repositories/PrismaContractRepository';
import { ContractStatus, contractValidityOn } from '../../../src/contracts/domain/Contract';
import { addDays } from '../../../src/contracts/domain/calendarDay';

const prisma = new PrismaClient();

/**
 * FR-CON-08, FR-CON-20: the list's validity filter is a database predicate, and
 * it must say the same as the domain function `contractValidityOn` for every
 * contract. This runs the filter over a table of contracts and compares each
 * answer with the rule, so the SQL and the rule cannot drift apart.
 */
describe('Contract validity filter against the domain rule (FR-CON-08)', () => {
  const tenantId = `t-validity-${randomUUID()}`;
  const userId = `u-validity-${randomUUID()}`;
  const clientId = randomUUID();
  const today = new Date('2026-10-05T00:00:00.000Z');
  const window = 30;
  const rows: Array<{ id: string; status: ContractStatus; startsAt: Date; endsAt: Date }> = [];

  beforeAll(async () => {
    await prisma.tenant.create({ data: { id: tenantId, name: 'Validity', urlSlug: tenantId } });
    await prisma.user.create({ data: { id: userId, tenantId, email: `${userId}@example.com`, hashedPassword: 'x', role: 'STAFF' } });
    await prisma.client.create({ data: { id: clientId, tenantId, name: 'Co', status: 'ACTIVE', customFieldValues: {}, lastUpdatedByUserId: userId } });

    const statuses = Object.values(ContractStatus);
    // Starts: long ago, the day before today, today, tomorrow. Ends: yesterday, today, +30 (edge of the window), +31, far.
    const starts = [-400, -1, 0, 1];
    const ends = [-1, 0, 1, window, window + 1, 400];
    for (const status of statuses) {
      for (const s of starts) {
        for (const e of ends) {
          if (e < s) continue; // a contract cannot end before it starts
          rows.push({ id: randomUUID(), status, startsAt: addDays(today, s), endsAt: addDays(today, e) });
        }
      }
    }
    await prisma.contract.createMany({
      data: rows.map((r) => ({
        id: r.id, tenantId, clientId, assignedUserId: userId, planName: 'p', status: r.status, amount: '1.00', billingPeriod: 'MONTHLY',
        startsAt: r.startsAt, endsAt: r.endsAt, createdByUserId: userId,
      })),
    });
  }, 60_000);

  afterAll(async () => {
    await new PrismaTenantDeletionTransaction(prisma).run(tenantId);
    await prisma.$disconnect();
  });

  const idsFor = async (validity: 'VALID' | 'EXPIRING_SOON' | 'NOT_VALID') => {
    const result = await new PrismaContractRepository(prisma).search({ tenantId, validity, today, expiringSoonDays: window, limit: 1000 });
    return new Set(result.data.map((contract) => contract.id));
  };

  it.each([
    ['VALID', (v: ReturnType<typeof contractValidityOn>) => v.valid],
    ['EXPIRING_SOON', (v: ReturnType<typeof contractValidityOn>) => v.valid && v.expiringSoon],
    ['NOT_VALID', (v: ReturnType<typeof contractValidityOn>) => !v.valid],
  ] as const)('FR-CON-08 %s returns exactly the contracts the domain rule says', async (filter, expected) => {
    const found = await idsFor(filter);
    const wanted = new Set(rows.filter((r) => expected(contractValidityOn(r, today, window))).map((r) => r.id));
    expect(found.size).toBe(wanted.size);
    expect([...found].filter((id) => !wanted.has(id))).toEqual([]);
    expect(found.size).toBeGreaterThan(0);
  });
});
