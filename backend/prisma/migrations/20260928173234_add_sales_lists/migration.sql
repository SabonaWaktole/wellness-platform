-- Slice 10 (FR-SET-05, 06): follow-up intervals and lost-deal reasons.
-- CreateTable
CREATE TABLE "FollowUpInterval" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "nameSq" TEXT NOT NULL,
    "nameEn" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowUpInterval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LostReason" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nameSq" TEXT NOT NULL,
    "nameEn" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LostReason_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FollowUpInterval_tenantId_order_idx" ON "FollowUpInterval"("tenantId", "order");

-- CreateIndex
CREATE INDEX "LostReason_tenantId_order_idx" ON "LostReason"("tenantId", "order");

-- AddForeignKey
ALTER TABLE "FollowUpInterval" ADD CONSTRAINT "FollowUpInterval_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LostReason" ADD CONSTRAINT "LostReason_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------
-- Seed data (FR-SET-10): the placeholder lists in
-- src/lookups/domain/DefaultLookups.ts, for every workspace that has none
-- yet. New workspaces get the same lists from PrismaLookupSeeder.
-- ---------------------------------------------------------------
INSERT INTO "FollowUpInterval" ("id", "tenantId", "days", "nameSq", "nameEn", "order", "updatedAt")
SELECT gen_random_uuid()::text, t."id", v."days", v."namesq", v."nameen", v."ord", CURRENT_TIMESTAMP
FROM "Tenant" t
CROSS JOIN (VALUES
  (3, '3 ditë', '3 days', 1),
  (5, '5 ditë', '5 days', 2),
  (7, '7 ditë', '7 days', 3)
) AS v("days", "namesq", "nameen", "ord")
WHERE NOT EXISTS (SELECT 1 FROM "FollowUpInterval" f WHERE f."tenantId" = t."id");

INSERT INTO "LostReason" ("id", "tenantId", "nameSq", "nameEn", "order", "updatedAt")
SELECT gen_random_uuid()::text, t."id", v."namesq", v."nameen", v."ord", CURRENT_TIMESTAMP
FROM "Tenant" t
CROSS JOIN (VALUES
  ('Shumë e shtrenjtë', 'Too expensive', 1),
  ('Ka tashmë një ofrues', 'Already has a provider', 2),
  ('Pa buxhet', 'No budget', 3),
  ('Pa përgjigje', 'No response', 4)
) AS v("namesq", "nameen", "ord")
WHERE NOT EXISTS (SELECT 1 FROM "LostReason" l WHERE l."tenantId" = t."id");
