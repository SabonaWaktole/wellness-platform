import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaTenantDeletionTransaction } from '../../../src/tenant/infrastructure/PrismaTenantDeletionTransaction';
import { PrismaLookupSeeder } from '../../../src/lookups/infrastructure/PrismaLookupSeeder';

/**
 * PRODUCTION INCIDENT, SEP 11 2026: deleting ANY tenant failed with
 *
 *   Foreign key constraint violated on the fields: (`tenantId`)
 *
 * at `tx.tenant.delete()`. `PrismaTenantDeletionTransaction` was written
 * before the forms feature (`ClientForm`/`FormVersion`/`FormSubmission`),
 * `Invoice`, and `OwnershipTransfer` existed, and nobody updated it when
 * those tables — each with its own `tenantId` foreign key defaulting to
 * Postgres' RESTRICT — were added. Because every tenant gets a default
 * `ClientForm` the moment it is provisioned (`EnsureDefaultClientFormUseCase`),
 * this broke deletion for every workspace on the platform, not an edge case.
 *
 * Nothing before this file exercised the real transaction against a real
 * schema — `DeleteTenantUseCase.test.ts` mocks `ITenantDeletionTransaction`
 * entirely, so it cannot see a foreign key. This is the test that would have
 * caught it, in the shape `tenantProvisioningAtomicity.test.ts` already
 * established for this same class of "looks atomic, isn't" bug.
 */
describe('Tenant deletion covers every table with a tenantId foreign key', () => {
  let prisma: PrismaClient;
  const tenantIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    // Best-effort: a passing test leaves nothing to clean up. This only fires
    // if an assertion failed mid-test and the transaction never got to run.
    if (tenantIds.length > 0) {
      await prisma.formSubmission.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.formVersion.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.clientForm.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.invoice.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.ownershipTransfer.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.quotation.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.client.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.businessType.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.riskLevel.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    }
    await prisma.$disconnect();
  });

  it('deletes a tenant that has a form, a submission, an invoice and an ownership transfer', async () => {
    const tenantId = randomUUID();
    tenantIds.push(tenantId);
    const slug = `deletion-coverage-${Date.now()}`;

    await prisma.tenant.create({ data: { id: tenantId, name: 'Deletion Coverage Co', urlSlug: slug } });

    const owner = await prisma.user.create({
      data: {
        id: randomUUID(),
        tenantId,
        email: `owner-${slug}@example.com`,
        hashedPassword: 'hashed',
        role: 'BUSINESS_OWNER',
      },
    });
    const staff = await prisma.user.create({
      data: {
        id: randomUUID(),
        tenantId,
        email: `staff-${slug}@example.com`,
        hashedPassword: 'hashed',
        role: 'STAFF',
      },
    });

    // ClientForm -> FormVersion -> FormSubmission: the chain that actually
    // broke deletion, since every tenant has at least a default ClientForm.
    const formId = randomUUID();
    await prisma.clientForm.create({
      data: { id: formId, tenantId, name: 'Intake', isDefault: true, layout: {}, settings: {} },
    });
    const formVersionId = randomUUID();
    await prisma.formVersion.create({
      data: { id: formVersionId, tenantId, formId, versionNumber: 1, document: {} },
    });
    await prisma.formSubmission.create({
      data: { id: randomUUID(), tenantId, formId, formVersionId, data: {} },
    });

    // Invoice: RESTRICT on tenantId AND on the Client/Quotation/User rows the
    // existing deletion order removes earlier — must be gone before any of
    // those run, not just before the final tenant delete.
    const clientId = randomUUID();
    await prisma.client.create({
      data: { id: clientId, tenantId, customFieldValues: {}, lastUpdatedByUserId: owner.id },
    });
    const quotationId = randomUUID();
    await prisma.quotation.create({
      data: { id: quotationId, tenantId, clientId, createdByUserId: owner.id, status: 'DRAFT' },
    });
    await prisma.invoice.create({
      data: {
        id: randomUUID(),
        tenantId,
        clientId,
        quotationId,
        createdByUserId: owner.id,
        status: 'DRAFT',
        dueDate: new Date(),
      },
    });

    // OwnershipTransfer: RESTRICT on tenantId AND on two User rows — must be
    // gone before `user.deleteMany()`, not just before the tenant delete.
    await prisma.ownershipTransfer.create({
      data: {
        id: randomUUID(),
        tenantId,
        originalOwnerId: owner.id,
        actingOwnerId: staff.id,
        previousActingRole: 'STAFF',
        status: 'ACTIVE',
        createdByUserId: owner.id,
      },
    });

    // BusinessType: RESTRICT on its RiskLevel, so the two cannot be left to
    // race each other down the cascade from Tenant.
    await new PrismaLookupSeeder(prisma).seed(tenantId);

    const deletionTx = new PrismaTenantDeletionTransaction(prisma);

    await expect(deletionTx.run(tenantId)).resolves.toBeUndefined();

    expect(await prisma.tenant.findUnique({ where: { id: tenantId } })).toBeNull();
    expect(await prisma.formSubmission.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.formVersion.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.clientForm.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.invoice.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.ownershipTransfer.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.user.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.businessType.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.riskLevel.count({ where: { tenantId } })).toBe(0);

    tenantIds.length = 0; // nothing left for afterAll to clean up
  });
});
