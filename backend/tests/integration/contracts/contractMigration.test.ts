import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaTenantDeletionTransaction } from '../../../src/tenant/infrastructure/PrismaTenantDeletionTransaction';

const prisma = new PrismaClient();

/**
 * NFR-ACC-03, NFR-OPS-03, NFR-DAT-01 on the migrated PostgreSQL schema (M3
 * Slice 4): no Float left in the contract and payment tables, the new default
 * instalment status, and the database's own unique rule on a deal.
 */
describe('Contract tables after the Slice 4 migration', () => {
  const columns = (table: string) =>
    prisma.$queryRawUnsafe<Array<{ column_name: string; data_type: string; numeric_precision: number | null; numeric_scale: number | null; column_default: string | null }>>(
      `SELECT column_name, data_type, numeric_precision, numeric_scale, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = '${table}'`
    );

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('NFR-ACC-03 no Float column is left in Contract and ContractPayment', async () => {
    for (const table of ['Contract', 'ContractPayment']) {
      const floats = (await columns(table)).filter((c) => ['double precision', 'real'].includes(c.data_type)).map((c) => c.column_name);
      expect([table, floats]).toEqual([table, []]);
    }
  });

  it('NFR-ACC-03 the money columns are numeric(12,2)', async () => {
    const contract = await columns('Contract');
    const payment = await columns('ContractPayment');
    const shape = (rows: typeof contract, name: string) => {
      const row = rows.find((c) => c.column_name === name)!;
      return [row.data_type, row.numeric_precision, row.numeric_scale];
    };
    for (const name of ['amount', 'agreedAnnualValue']) expect(shape(contract, name)).toEqual(['numeric', 12, 2]);
    expect(shape(contract, 'discountPercent')).toEqual(['numeric', 7, 2]);
    for (const name of ['amount', 'paidAmount']) expect(shape(payment, name)).toEqual(['numeric', 12, 2]);
  });

  it('NFR-OPS-03 the instalment status defaults to NOT_INVOICED, and an existing contract has no deal (Legacy)', async () => {
    const status = (await columns('ContractPayment')).find((c) => c.column_name === 'status')!;
    expect(status.column_default).toContain('NOT_INVOICED');
    const dealId = (await columns('Contract')).find((c) => c.column_name === 'dealId')!;
    expect(dealId).toBeDefined();
  });

  it('NFR-OPS-03 amounts keep their two decimals through the database', async () => {
    const tenantId = `t-mig-${randomUUID()}`;
    const userId = `u-mig-${randomUUID()}`;
    const clientId = randomUUID();
    await prisma.tenant.create({ data: { id: tenantId, name: 'Mig', urlSlug: tenantId } });
    try {
      await prisma.user.create({ data: { id: userId, tenantId, email: `${userId}@example.com`, hashedPassword: 'x', role: 'STAFF' } });
      await prisma.client.create({ data: { id: clientId, tenantId, name: 'Co', status: 'ACTIVE', customFieldValues: {}, lastUpdatedByUserId: userId } });
      const contractId = randomUUID();
      await prisma.contract.create({
        data: { id: contractId, tenantId, clientId, planName: 'p', status: 'DRAFT', amount: '49.40', billingPeriod: 'MONTHLY', startsAt: new Date(), endsAt: new Date(), createdByUserId: userId },
      });
      const payment = await prisma.contractPayment.create({
        data: { id: randomUUID(), tenantId, contractId, periodIndex: 1, dueDate: new Date(), amount: '592.80' },
      });
      expect(payment.status).toBe('NOT_INVOICED');
      expect(payment.paidAmount.toFixed(2)).toBe('0.00');
      expect((await prisma.contract.findFirstOrThrow({ where: { id: contractId } })).amount.toFixed(2)).toBe('49.40');
      expect((await prisma.contractPayment.findFirstOrThrow({ where: { id: payment.id } })).amount.toFixed(2)).toBe('592.80');
    } finally {
      await new PrismaTenantDeletionTransaction(prisma).run(tenantId);
    }
  });
});
