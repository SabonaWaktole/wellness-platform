import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaLegacyClientMigrationStore } from '../../../src/clients/infrastructure/legacy/PrismaLegacyClientMigrationStore';
import { MigrateLegacyClientsUseCase } from '../../../src/clients/application/use-cases/MigrateLegacyClientsUseCase';
import { RevertLegacyMigrationUseCase } from '../../../src/clients/application/use-cases/RevertLegacyMigrationUseCase';
import { LegacyMappingConfig } from '../../../src/clients/domain/legacy/LegacyMappingConfig';
import { PrismaLookupSeeder } from '../../../src/lookups/infrastructure/PrismaLookupSeeder';

const prisma = new PrismaClient();

/**
 * The Slice 14 migration end to end, against a real database (FR-CMP-08,
 * NFR-OPS-01): a dry run changes nothing, `apply` is idempotent, the counts
 * reconcile, every changed client gets one audit entry, and `--revert`
 * restores the pre-migration state.
 */
describe('Legacy client migration (Slice 14)', () => {
  const tenantId = `t-legacy-${randomUUID()}`;
  const slug = tenantId;
  const store = new PrismaLegacyClientMigrationStore(prisma);
  const useCase = new MigrateLegacyClientsUseCase(store);
  const revertUseCase = new RevertLegacyMigrationUseCase(store);
  const userId = `u-legacy-${randomUUID()}`;

  let businessTypeId: string;
  let areaId: string;
  let cityId: string;

  let clientWithCustomFields: string;
  let clientAlreadyComplete: string;
  let clientPhoneOnly: string;
  let clientInvalidEmail: string;
  let clientArchived: string;

  const config: LegacyMappingConfig = {
    tenant: slug,
    fields: {
      businessType: { from: ['Industry'], values: { Hospitality: 'Kafene' } },
      employeeCount: { from: ['Employees'] },
      city: { from: ['Qyteti'] },
    },
  };

  beforeAll(async () => {
    await prisma.tenant.create({ data: { id: tenantId, name: 'Legacy tenant', urlSlug: slug } });
    await prisma.user.create({
      data: { id: userId, email: `${userId}@example.com`, hashedPassword: 'x', role: 'STAFF', tenantId, firstName: 'Ada' },
    });
    await new PrismaLookupSeeder(prisma).seed(tenantId);

    businessTypeId = (await prisma.businessType.findFirstOrThrow({ where: { tenantId, nameSq: 'Kafene' } })).id;
    areaId = (await prisma.area.findFirstOrThrow({ where: { tenantId, nameSq: 'Tiranë' } })).id;
    cityId = (await prisma.city.findFirstOrThrow({ where: { tenantId, areaId, nameSq: 'Tiranë' } })).id;

    const baseClient = (overrides: Record<string, unknown>) => ({
      id: randomUUID(),
      tenantId,
      lastUpdatedByUserId: userId,
      customFieldValues: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    });

    clientWithCustomFields = randomUUID();
    await prisma.client.create({
      data: baseClient({
        id: clientWithCustomFields,
        name: 'Kafja Elira',
        email: 'elira@kafja.al',
        customFieldValues: { Industry: 'Hospitality', Employees: '6', Qyteti: 'Tiranë' },
      }),
    });

    clientAlreadyComplete = randomUUID();
    await prisma.client.create({
      data: baseClient({
        id: clientAlreadyComplete,
        name: 'Complete SHPK',
        businessTypeId,
        employeeCount: 10,
        areaId,
        cityId,
      }),
    });
    await prisma.contactPerson.create({
      data: {
        id: randomUUID(), tenantId, clientId: clientAlreadyComplete, name: 'Owner', isPrimary: true,
        createdAt: new Date(), updatedAt: new Date(),
      },
    });

    clientPhoneOnly = randomUUID();
    await prisma.client.create({
      data: baseClient({ id: clientPhoneOnly, name: 'Phone Only', phone: '+355691234567' }),
    });

    clientInvalidEmail = randomUUID();
    await prisma.client.create({
      data: baseClient({ id: clientInvalidEmail, name: 'Bad Email Co', email: 'not-an-email' }),
    });

    clientArchived = randomUUID();
    await prisma.client.create({
      data: baseClient({ id: clientArchived, name: 'Archived Co', deletedAt: new Date() }),
    });
  });

  afterAll(async () => {
    await prisma.auditEntry.deleteMany({ where: { tenantId } });
    await prisma.contactPerson.deleteMany({ where: { tenantId } });
    await prisma.client.deleteMany({ where: { tenantId } });
    await prisma.customFieldDefinition.deleteMany({ where: { tenantId } });
    await prisma.businessType.deleteMany({ where: { tenantId } });
    await prisma.riskLevel.deleteMany({ where: { tenantId } });
    await prisma.city.deleteMany({ where: { tenantId } });
    await prisma.area.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  const snapshotClients = () => prisma.client.findMany({ where: { tenantId }, orderBy: { id: 'asc' } });

  it('FR-CMP-08 a dry run changes nothing', async () => {
    const before = await snapshotClients();

    const result = await useCase.execute({ tenantSlug: slug, config, apply: false });

    const after = await snapshotClients();
    expect(after).toEqual(before);
    expect(result.manifest).toBeNull();
    expect(result.totals.clients).toBe(5);
  });

  it('FR-CMP-08 apply fills mapped columns, creates contacts, and is idempotent on a second run', async () => {
    const first = await useCase.execute({ tenantSlug: slug, config, apply: true });

    expect(first.errors).toEqual([]);
    // clientWithCustomFields, clientPhoneOnly and clientInvalidEmail get written;
    // clientAlreadyComplete and clientArchived (no legacy fields, no reach) do not.
    expect(first.totals.updated).toBeGreaterThanOrEqual(2);
    expect(first.manifest?.entries.length).toBe(first.totals.updated);

    const mapped = await prisma.client.findUnique({ where: { id: clientWithCustomFields } });
    expect(mapped?.businessTypeId).toBe(businessTypeId);
    expect(mapped?.employeeCount).toBe(6);
    expect(mapped?.cityId).toBe(cityId);
    expect(mapped?.areaId).toBe(areaId);

    const contact = await prisma.contactPerson.findFirst({ where: { tenantId, clientId: clientWithCustomFields } });
    expect(contact?.email).toBe('elira@kafja.al');
    expect(contact?.isPrimary).toBe(true);

    const phoneContact = await prisma.contactPerson.findFirst({ where: { tenantId, clientId: clientPhoneOnly } });
    expect(phoneContact?.phone).toBe('+355691234567');
    expect(phoneContact?.name).toBe('Phone Only');

    // The invalid-email client gets no contact at all.
    const badEmailContact = await prisma.contactPerson.findFirst({ where: { tenantId, clientId: clientInvalidEmail } });
    expect(badEmailContact).toBeNull();

    const before = await snapshotClients();
    const second = await useCase.execute({ tenantSlug: slug, config, apply: true });
    const after = await snapshotClients();

    expect(after).toEqual(before);
    expect(second.totals.updated).toBe(0);
    expect(second.manifest?.entries).toEqual([]);
  });

  it('FR-AUD-02 leaves one system-actor audit entry per changed client', async () => {
    const entries = await prisma.auditEntry.findMany({ where: { tenantId, entityId: clientWithCustomFields } });
    expect(entries).toHaveLength(1);
    expect(entries[0].userId).toBeNull();
    expect(entries[0].userRole).toBe('SYSTEM');
    expect((entries[0].changes as any[]).some((c) => c.field === 'businessTypeId')).toBe(true);
  });

  it('NFR-OPS-01 counts reconcile: no client is lost or duplicated, and unmapped custom values survive', async () => {
    const rows = await snapshotClients();
    expect(rows).toHaveLength(5);
    const withCustomFields = rows.find((r) => r.id === clientWithCustomFields)!;
    expect((withCustomFields.customFieldValues as any).Industry).toBe('Hospitality');
  });

  it('NFR-OPS-01 --revert restores the pre-migration state', async () => {
    const config2: LegacyMappingConfig = { tenant: slug, fields: { taxId: { from: ['NIPT'] } } };
    const clientId = randomUUID();
    await prisma.client.create({
      data: {
        id: clientId, tenantId, lastUpdatedByUserId: userId, customFieldValues: { NIPT: 'K999' },
        createdAt: new Date(), updatedAt: new Date(),
      },
    });

    const applied = await useCase.execute({ tenantSlug: slug, config: config2, apply: true });
    const entry = applied.manifest!.entries.find((e) => e.clientId === clientId)!;
    expect(entry.profilePatch.taxId).toBe('K999');

    const revertResult = await revertUseCase.execute(applied.manifest!);
    expect(revertResult.errors).toEqual([]);

    const reverted = await prisma.client.findUnique({ where: { id: clientId } });
    expect(reverted?.taxId).toBeNull();

    await prisma.client.delete({ where: { id: clientId } });
  });

  it('rejects an unknown tenant', async () => {
    await expect(useCase.execute({ tenantSlug: 'no-such-tenant', config, apply: false })).rejects.toThrow();
  });
});
