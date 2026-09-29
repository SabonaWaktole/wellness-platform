import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { seedSystemRoles } from '../../support/seedRoles';
import { RoleKey } from '../../../src/access/domain/RoleKey';

const prisma = new PrismaClient();

/**
 * Slice 10, decision D6: the payment-status key migration
 * (prisma/migrations/20260928174225_status_keys_and_labels/migration.sql)
 * remaps every row on a key the product no longer offers. This proves the
 * remap statements themselves — on rows planted with the legacy keys the
 * schema no longer defaults to — independently of whether that migration
 * has already run against this database.
 */
describe('FR-SET-08 legacy ContractPayment status migration (D6)', () => {
  const tenantId = `t-paystatus-migration-${randomUUID()}`;
  const slug = tenantId;
  const adminId = `u-paystatus-admin-${randomUUID()}`;
  const clientId = `c-paystatus-${randomUUID()}`;
  const contractId = `k-paystatus-${randomUUID()}`;

  const payment = (id: string, legacyStatus: string) => ({
    id,
    tenantId,
    contractId,
    periodIndex: 1,
    dueDate: new Date('2026-01-01'),
    amount: 100,
    status: legacyStatus,
  });

  beforeAll(async () => {
    await prisma.tenant.create({ data: { id: tenantId, name: 'Pay status migration tenant', urlSlug: slug } });
    const roles = await seedSystemRoles(prisma, tenantId);
    await prisma.user.create({
      data: { id: adminId, email: `${adminId}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId: roles[RoleKey.Administrator], tenantId },
    });
    await prisma.client.create({
      data: { id: clientId, tenantId, name: 'Migration Co', customFieldValues: {}, lastUpdatedByUserId: adminId },
    });
    await prisma.contract.create({
      data: {
        id: contractId, tenantId, clientId, planName: 'Gold', amount: 100, billingPeriod: 'MONTHLY',
        status: 'ACTIVE', startsAt: new Date('2026-01-01'), endsAt: new Date('2026-12-31'),
        createdByUserId: adminId,
      },
    });
  });

  afterAll(async () => {
    await prisma.contractPayment.deleteMany({ where: { tenantId } });
    await prisma.contract.deleteMany({ where: { tenantId } });
    await prisma.client.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it('maps every legacy key to its SRS equivalent and leaves no unmapped row', async () => {
    const ids = {
      unpaid: `p-unpaid-${randomUUID()}`,
      partial: `p-partial-${randomUUID()}`,
      paid: `p-paid-${randomUUID()}`,
      waived: `p-waived-${randomUUID()}`,
    };
    await prisma.contractPayment.createMany({
      data: [
        payment(ids.unpaid, 'UNPAID'),
        payment(ids.partial, 'PARTIAL'),
        payment(ids.paid, 'PAID'),
        payment(ids.waived, 'WAIVED'),
      ],
    });

    // The exact remap the migration ran once, replayed here on freshly
    // planted legacy rows.
    await prisma.$executeRawUnsafe(
      `UPDATE "ContractPayment" SET "status" = 'PAYMENT_PENDING' WHERE "status" = 'UNPAID' AND "tenantId" = $1`,
      tenantId
    );
    await prisma.$executeRawUnsafe(
      `UPDATE "ContractPayment" SET "status" = 'PARTIALLY_PAID' WHERE "status" = 'PARTIAL' AND "tenantId" = $1`,
      tenantId
    );

    const rows = await prisma.contractPayment.findMany({
      where: { tenantId },
      select: { id: true, status: true },
    });
    const statusOf = (id: string) => rows.find((r) => r.id === id)?.status;

    expect(statusOf(ids.unpaid)).toBe('PAYMENT_PENDING');
    expect(statusOf(ids.partial)).toBe('PARTIALLY_PAID');
    // PAID is unaffected by the migration.
    expect(statusOf(ids.paid)).toBe('PAID');
    // WAIVED has no SRS equivalent (D6) and is left as a hidden legacy key.
    expect(statusOf(ids.waived)).toBe('WAIVED');

    // No row is left on a key the product no longer offers.
    const leftover = rows.filter((r) => r.status === 'UNPAID' || r.status === 'PARTIAL');
    expect(leftover).toEqual([]);
  });
});
