import { PrismaClient } from '@prisma/client';
import { PrismaClientRepository } from '../src/clients/infrastructure/repositories/PrismaClientRepository';
import { PrismaCustomFieldDefinitionRepository } from '../src/clients/infrastructure/repositories/PrismaCustomFieldDefinitionRepository';
import { EnsureDefaultClientFieldsUseCase } from '../src/clients/application/use-cases/EnsureDefaultClientFieldsUseCase';
import { CreateClientUseCase } from '../src/clients/application/use-cases/CreateClientUseCase';
import { UpdateClientUseCase } from '../src/clients/application/use-cases/UpdateClientUseCase';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  const tenantId = randomUUID();
  const userId = randomUUID();

  await prisma.tenant.create({ data: { id: tenantId, name: 'MySQL Test Co', urlSlug: `mysql-test-${tenantId.slice(0, 8)}` } });
  await prisma.user.create({
    data: { id: userId, email: `owner-${tenantId.slice(0, 8)}@test.com`, hashedPassword: 'x', role: 'BUSINESS_OWNER', tenantId },
  });

  const clientRepo = new PrismaClientRepository(prisma);
  const customFieldRepo = new PrismaCustomFieldDefinitionRepository(prisma);
  const ensureDefaults = new EnsureDefaultClientFieldsUseCase(customFieldRepo, clientRepo);
  const createClientUseCase = new CreateClientUseCase(clientRepo, customFieldRepo, ensureDefaults);
  const updateClientUseCase = new UpdateClientUseCase(clientRepo, customFieldRepo, ensureDefaults);

  console.log('--- 1. EnsureDefaultClientFieldsUseCase seeds 5 role fields on MySQL ---');
  const defs = await ensureDefaults.execute(tenantId);
  console.log(defs.map(d => ({ fieldName: d.fieldName, role: d.role, order: d.order, required: d.required })));
  if (defs.length !== 5) throw new Error(`Expected 5 seeded fields, got ${defs.length}`);

  console.log('--- 2. Create a client via customFieldValues (exercises Client.create + resolver) ---');
  const client = await createClientUseCase.execute({
    tenantId,
    authorUserId: userId,
    customFieldValues: { Name: 'MySQL Corp', Email: 'mysql@test.com', Status: 'PROSPECT' },
  });
  console.log({ name: client.name, email: client.contactInfo.email, status: client.status });
  if (client.name !== 'MySQL Corp') throw new Error('name resolution failed');

  console.log('--- 3. Simulate a pre-existing row with ONLY legacy columns (as if migrated from prod) ---');
  const legacyClientId = randomUUID();
  await prisma.client.create({
    data: {
      id: legacyClientId,
      tenantId,
      name: 'Legacy Row Corp',
      email: 'legacy@test.com',
      phone: '555-1234',
      status: 'ACTIVE',
      assignedUserId: userId,
      customFieldValues: {},
      lastUpdatedByUserId: userId,
    },
  });

  console.log('--- 4. Directly exercise backfillLegacyBasicFields() MySQL JSON_SET branch ---');
  const fieldNameByRole: Record<string, string> = {};
  for (const d of defs) if (d.role) fieldNameByRole[d.role] = d.fieldName;
  await clientRepo.backfillLegacyBasicFields(tenantId, fieldNameByRole as any);

  const backfilled = await prisma.client.findUnique({ where: { id: legacyClientId } });
  console.log('customFieldValues after backfill:', backfilled?.customFieldValues);
  const cfv = backfilled?.customFieldValues as any;
  if (cfv.Name !== 'Legacy Row Corp') throw new Error(`backfill Name failed: ${JSON.stringify(cfv)}`);
  if (cfv.Email !== 'legacy@test.com') throw new Error(`backfill Email failed: ${JSON.stringify(cfv)}`);
  if (cfv.Phone !== '555-1234') throw new Error(`backfill Phone failed: ${JSON.stringify(cfv)}`);
  if (cfv.Status !== 'ACTIVE') throw new Error(`backfill Status failed: ${JSON.stringify(cfv)}`);
  if (cfv['Assigned To'] !== userId) throw new Error(`backfill Assigned To failed: ${JSON.stringify(cfv)}`);

  console.log('--- 5. Search (MySQL raw-SQL JSON_CONTAINS branch, pre-existing code) ---');
  const searchRes = await clientRepo.search(tenantId, { customFields: { Name: 'MySQL Corp' } }, 0, 10);
  console.log('search result count:', searchRes.total, searchRes.items.map(i => i.name));
  if (searchRes.total !== 1) throw new Error('JSON_CONTAINS search failed on MySQL');

  console.log('--- 6. Update merges customFieldValues correctly ---');
  const updated = await updateClientUseCase.execute({
    tenantId,
    clientId: client.id,
    updatingUserId: userId,
    customFieldValues: { Email: 'updated@test.com' },
  });
  console.log({ name: updated.name, email: updated.contactInfo.email });
  if (updated.name !== 'MySQL Corp' || updated.contactInfo.email !== 'updated@test.com') {
    throw new Error('merge update failed');
  }

  console.log('--- 7. Role uniqueness constraint enforced (attempt duplicate PRIMARY_NAME role) ---');
  try {
    await prisma.customFieldDefinition.create({
      data: { id: randomUUID(), tenantId, fieldName: 'Full Name 2', fieldType: 'TEXT', options: [], role: 'PRIMARY_NAME' },
    });
    throw new Error('Expected unique constraint violation, but insert succeeded');
  } catch (e: any) {
    if (!String(e.message).includes('Unique constraint')) throw e;
    console.log('OK: duplicate role rejected by unique index');
  }

  console.log('\nALL MYSQL COMPATIBILITY CHECKS PASSED');
}

main()
  .catch((e) => {
    console.error('MYSQL COMPAT TEST FAILED:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
