-- Slice 8 (FR-SET-01, 02): admin-managed risk levels and business types, each
-- business type tied to one risk level.
-- CreateTable
CREATE TABLE "RiskLevel" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "nameSq" TEXT NOT NULL,
    "nameEn" TEXT,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessType" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nameSq" TEXT NOT NULL,
    "nameEn" TEXT,
    "riskLevelId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RiskLevel_tenantId_order_idx" ON "RiskLevel"("tenantId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "RiskLevel_tenantId_level_key" ON "RiskLevel"("tenantId", "level");

-- CreateIndex
CREATE INDEX "BusinessType_tenantId_order_idx" ON "BusinessType"("tenantId", "order");

-- CreateIndex
CREATE INDEX "BusinessType_riskLevelId_idx" ON "BusinessType"("riskLevelId");

-- AddForeignKey
ALTER TABLE "RiskLevel" ADD CONSTRAINT "RiskLevel_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessType" ADD CONSTRAINT "BusinessType_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessType" ADD CONSTRAINT "BusinessType_riskLevelId_fkey" FOREIGN KEY ("riskLevelId") REFERENCES "RiskLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------
-- Seed data (FR-SET-10): the placeholder lists in
-- src/lookups/domain/DefaultLookups.ts, for every workspace that has none yet.
-- New workspaces get the same lists from PrismaLookupSeeder.
-- ---------------------------------------------------------------
INSERT INTO "RiskLevel" ("id", "tenantId", "level", "nameSq", "nameEn", "description", "order", "updatedAt")
SELECT gen_random_uuid()::text, t."id", v."level", v."namesq", v."nameen", v."description", v."ord", CURRENT_TIMESTAMP
FROM "Tenant" t
CROSS JOIN (VALUES
  (1, 'Niveli 1', 'Level 1', 'Rrezik i ulët', 1),
  (2, 'Niveli 2', 'Level 2', 'Rrezik i mesëm', 2),
  (3, 'Niveli 3', 'Level 3', 'Rrezik i lartë', 3)
) AS v("level", "namesq", "nameen", "description", "ord")
WHERE NOT EXISTS (SELECT 1 FROM "RiskLevel" r WHERE r."tenantId" = t."id");

INSERT INTO "BusinessType" ("id", "tenantId", "nameSq", "nameEn", "riskLevelId", "order", "updatedAt")
SELECT gen_random_uuid()::text, t."id", v."namesq", v."nameen", r."id", v."ord", CURRENT_TIMESTAMP
FROM "Tenant" t
CROSS JOIN (VALUES
  ('Qendër thirrjesh', 'Call center', 1, 1),
  ('Zyrë', 'Office', 1, 2),
  ('Kafene', 'Café', 1, 3),
  ('Dyqan', 'Retail shop', 1, 4),
  ('Restorant', 'Restaurant', 2, 5),
  ('Hotel', 'Hotel', 2, 6),
  ('Magazinë', 'Warehouse', 2, 7),
  ('Ndërtim', 'Construction', 3, 8),
  ('Fabrikë', 'Factory', 3, 9)
) AS v("namesq", "nameen", "risklevel", "ord")
JOIN "RiskLevel" r ON r."tenantId" = t."id" AND r."level" = v."risklevel"
WHERE NOT EXISTS (SELECT 1 FROM "BusinessType" b WHERE b."tenantId" = t."id");
