-- Slice 11 (FR-CMP-01, 02, 03; Q8, Q9): the company profile fields, and the
-- client status fixed set. Existing companies get NULL profile fields — the
-- application requires them for a company created or edited through the
-- company form, and Slice 14 reports on what still needs completing by hand.

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "areaId" TEXT,
ADD COLUMN     "businessTypeId" TEXT,
ADD COLUMN     "cityId" TEXT,
ADD COLUMN     "employeeCount" INTEGER,
ADD COLUMN     "streetAddress" TEXT,
ADD COLUMN     "taxId" TEXT,
ADD COLUMN     "website" TEXT;

-- CreateIndex
CREATE INDEX "Client_tenantId_businessTypeId_idx" ON "Client"("tenantId", "businessTypeId");

-- CreateIndex
CREATE INDEX "Client_tenantId_areaId_cityId_idx" ON "Client"("tenantId", "areaId", "cityId");

-- CreateIndex
CREATE UNIQUE INDEX "Client_tenantId_taxId_key" ON "Client"("tenantId", "taxId");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_businessTypeId_fkey" FOREIGN KEY ("businessTypeId") REFERENCES "BusinessType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Client status fixed set (Q9): LEAD, PROSPECT, CLIENT, FORMER_CLIENT.
-- ACTIVE -> CLIENT, INACTIVE -> FORMER_CLIENT, PROSPECT unchanged. LEAD has
-- no legacy equivalent, so no row is remapped onto it. Any other legacy value
-- is left as-is, for Slice 14's "needs completion" report.
UPDATE "Client" SET "status" = 'CLIENT' WHERE "status" = 'ACTIVE';
UPDATE "Client" SET "status" = 'FORMER_CLIENT' WHERE "status" = 'INACTIVE';

-- The same remap, applied at each tenant's own STATUS custom field key
-- (FieldRole.STATUS's fieldName is tenant-renameable, so this cannot be a
-- fixed column name).
UPDATE "Client" c
SET "customFieldValues" = jsonb_set(
  c."customFieldValues",
  ARRAY[cfd."fieldName"],
  to_jsonb(
    CASE c."customFieldValues" ->> cfd."fieldName"
      WHEN 'ACTIVE' THEN 'CLIENT'
      WHEN 'INACTIVE' THEN 'FORMER_CLIENT'
      ELSE c."customFieldValues" ->> cfd."fieldName"
    END
  )
)
FROM "CustomFieldDefinition" cfd
WHERE cfd."tenantId" = c."tenantId"
  AND cfd."role" = 'STATUS'
  AND c."customFieldValues" ? cfd."fieldName"
  AND c."customFieldValues" ->> cfd."fieldName" IN ('ACTIVE', 'INACTIVE');

-- The STATUS field's own option list, so re-editing it shows the fixed set.
UPDATE "CustomFieldDefinition"
SET "options" = '["LEAD", "PROSPECT", "CLIENT", "FORMER_CLIENT"]'::json
WHERE "role" = 'STATUS';
