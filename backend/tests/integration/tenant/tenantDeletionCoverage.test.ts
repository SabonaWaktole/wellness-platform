import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaTenantDeletionTransaction } from '../../../src/tenant/infrastructure/PrismaTenantDeletionTransaction';
import { PrismaLookupSeeder } from '../../../src/lookups/infrastructure/PrismaLookupSeeder';
import { PrismaPricingSeeder } from '../../../src/pricing/infrastructure/PrismaPricingSeeder';
import { PrismaSalesScriptSeeder } from '../../../src/salesScript/infrastructure/PrismaSalesScriptSeeder';

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
      await prisma.interaction.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.dealStageHistory.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.deal.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.invoice.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.ownershipTransfer.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.quotation.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.contactPerson.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.client.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.salesScript.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.priceZone.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.businessType.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.riskLevel.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.city.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.area.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.followUpInterval.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.lostReason.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.activityResult.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.statusLabel.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    }
    await prisma.$disconnect();
  });

  /*
   * Many test files clean up with a plain `prisma.tenant.deleteMany()`, which
   * leaves the order to the cascade. Postgres checks a RESTRICT key inside each
   * cascade step, so a workspace with the default price zones once failed on
   * PriceZoneCity's City key whenever City went before PriceZone (CI on M2
   * Slices 3–6). The key cascades now; this proves a seeded workspace goes.
   */
  it('FR-PCF-05 a workspace with the default lists and price zones can be deleted by a plain tenant delete', async () => {
    const tenantId = randomUUID();
    tenantIds.push(tenantId);
    await prisma.tenant.create({ data: { id: tenantId, name: 'Cascade Co', urlSlug: `cascade-${Date.now()}` } });
    await new PrismaLookupSeeder(prisma).seed(tenantId);
    await new PrismaPricingSeeder(prisma).seed(tenantId);
    expect(await prisma.priceZoneCity.count({ where: { zone: { tenantId } } })).toBeGreaterThan(0);

    // The cities first, as a cascade may: this is the order that broke.
    await prisma.$transaction(async (tx) => {
      await tx.city.deleteMany({ where: { tenantId } });
      await tx.tenant.delete({ where: { id: tenantId } });
    });

    expect(await prisma.tenant.findUnique({ where: { id: tenantId } })).toBeNull();
    expect(await prisma.priceZone.count({ where: { tenantId } })).toBe(0);
    tenantIds.splice(tenantIds.indexOf(tenantId), 1);
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

    // ContactPerson: RESTRICT on its own tenantId FK, must be gone before the
    // tenant delete (its clientId FK cascades from Client, but that is not
    // relied on here — see the comment beside contactPerson.deleteMany).
    const contactId = randomUUID();
    await prisma.contactPerson.create({
      data: { id: contactId, tenantId, clientId, name: 'Jane Doe', phone: '+355691234567', isPrimary: true },
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

    // BusinessType: RESTRICT on its RiskLevel, and City: RESTRICT on its
    // Area, so neither pair can be left to race each other down the cascade
    // from Tenant. The seeder creates both pairs, plus follow-up intervals
    // and lost-deal reasons, for every tenant.
    await new PrismaLookupSeeder(prisma).seed(tenantId);
    // PriceZoneCity points at City (M2 Slice 3); the pricing seed gives every
    // tenant zones with cities, and a package with services.
    await new PrismaPricingSeeder(prisma).seed(tenantId);
    // The sales script names its author through a SET NULL key on User (M2
    // Slice 5); a draft by the owner proves that key is no obstacle.
    await new PrismaSalesScriptSeeder(prisma).seed(tenantId);
    await prisma.salesScript.create({
      data: { id: randomUUID(), tenantId, version: 2, status: 'DRAFT', liveSlot: 'DRAFT', contentSq: { type: 'doc', content: [] }, createdByUserId: owner.id },
    });

    // A deal holds RESTRICT keys on Client, User, LostReason, ServicePackage
    // and Quotation (M2 Slice 6), and its stage history names a user under
    // RESTRICT too; a lost deal with a package and a won offer covers them all.
    const lostReason = await prisma.lostReason.findFirstOrThrow({ where: { tenantId } });
    const servicePackage = await prisma.servicePackage.findFirstOrThrow({ where: { tenantId } });
    const dealId = randomUUID();
    await prisma.deal.create({
      data: {
        id: dealId,
        tenantId,
        clientId,
        ownerUserId: staff.id,
        createdByUserId: owner.id,
        type: 'NEW_CONTRACT',
        stageKey: 'LOST',
        lostReasonId: lostReason.id,
        packageId: servicePackage.id,
        wonQuotationId: quotationId,
      },
    });
    await prisma.dealStageHistory.create({
      data: { id: randomUUID(), tenantId, dealId, fromStage: 'NEW_LEAD', toStage: 'LOST', changedByUserId: staff.id },
    });

    // An activity holds RESTRICT keys on Deal, ContactPerson, ActivityResult
    // and two users (M2 Slice 7), so it has to go before every one of them.
    const activityResult = await prisma.activityResult.findFirstOrThrow({ where: { tenantId } });
    await prisma.interaction.create({
      data: {
        id: randomUUID(),
        tenantId,
        clientId,
        authorUserId: staff.id,
        content: 'Called about the offer',
        channel: 'CALL',
        occurredAt: new Date(),
        contactPersonId: contactId,
        dealId,
        resultId: activityResult.id,
        updatedAt: new Date(),
        updatedByUserId: owner.id,
      },
    });

    // StatusLabel cascades cleanly (no RESTRICT anywhere), but is still
    // covered here so a tenant with an edited status label is proven clean too.
    await prisma.statusLabel.create({
      data: { tenantId, domain: 'CONTRACT', key: 'ACTIVE', labelSq: 'Aktive', colour: '#3DAA6C' },
    });

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
    expect(await prisma.city.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.area.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.followUpInterval.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.lostReason.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.statusLabel.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.contactPerson.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.priceZone.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.riskSurcharge.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.visitFrequency.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.employeeBand.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.pricingSettings.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.servicePackage.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.service.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.salesScript.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.deal.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.dealStageHistory.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.interaction.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.activityResult.count({ where: { tenantId } })).toBe(0);

    tenantIds.length = 0; // nothing left for afterAll to clean up
  });
});
