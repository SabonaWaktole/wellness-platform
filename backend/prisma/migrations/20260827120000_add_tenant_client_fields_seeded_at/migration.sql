-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "clientFieldsSeededAt" TIMESTAMP(3);

-- Backfill: any tenant that already has a roled custom field has been through
-- the seeder (roles are only ever written by it), so mark it seeded. Without
-- this, the first field-list read after deploy would recreate the very fields
-- a tenant had already deleted, then stamp — one last unwanted respawn.
UPDATE "Tenant" t
SET "clientFieldsSeededAt" = NOW()
WHERE EXISTS (
  SELECT 1 FROM "CustomFieldDefinition" c
  WHERE c."tenantId" = t."id" AND c."role" IS NOT NULL
);
