-- M2 Slice 7: interactions become activities (FR-ACT-01, 02, 07) and the
-- activity results list (FR-ACT-03). Every new Interaction column is
-- nullable (D5); the data section below fills `occurredAt` and `resultId` for
-- the rows that existed before. `outcomeCategoryId` stays until Milestone 3.

-- AlterTable
ALTER TABLE "Interaction" ADD COLUMN     "clientFeedback" TEXT,
ADD COLUMN     "contactPersonId" TEXT,
ADD COLUMN     "dealId" TEXT,
ADD COLUMN     "nextAction" TEXT,
ADD COLUMN     "occurredAt" TIMESTAMP(3),
ADD COLUMN     "resultId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3),
ADD COLUMN     "updatedByUserId" TEXT;

-- CreateTable
CREATE TABLE "ActivityResult" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nameSq" TEXT NOT NULL,
    "nameEn" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivityResult_tenantId_order_idx" ON "ActivityResult"("tenantId", "order");

-- CreateIndex
CREATE INDEX "Interaction_tenantId_clientId_occurredAt_idx" ON "Interaction"("tenantId", "clientId", "occurredAt");

-- CreateIndex
CREATE INDEX "Interaction_tenantId_dealId_occurredAt_idx" ON "Interaction"("tenantId", "dealId", "occurredAt");

-- CreateIndex
CREATE INDEX "Interaction_contactPersonId_idx" ON "Interaction"("contactPersonId");

-- CreateIndex
CREATE INDEX "Interaction_dealId_idx" ON "Interaction"("dealId");

-- CreateIndex
CREATE INDEX "Interaction_resultId_idx" ON "Interaction"("resultId");

-- CreateIndex
CREATE INDEX "Interaction_updatedByUserId_idx" ON "Interaction"("updatedByUserId");

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_contactPersonId_fkey" FOREIGN KEY ("contactPersonId") REFERENCES "ContactPerson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "ActivityResult"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityResult" ADD CONSTRAINT "ActivityResult_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------
-- BEGIN DATA (FR-ACT-07, NFR-OPS-02). Replayed by
-- tests/integration/activities/interactionMigration.test.ts, so every
-- statement here must stay idempotent.
--
-- Only workspaces with no activity results yet get the list: the defaults
-- from src/lookups/domain/DefaultLookups.ts (Q14), then every legacy
-- OutcomeCategory label that is not already one of them. A copied category
-- keeps its id, so interactions map by key, not by label. A legacy row is one
-- with no `occurredAt`; it gets its result first and its date last.
-- ---------------------------------------------------------------
DO $$ BEGIN
  RAISE NOTICE 'm2 activities before: % interactions, % without occurredAt, % outcome categories, % activity results',
    (SELECT COUNT(*) FROM "Interaction"),
    (SELECT COUNT(*) FROM "Interaction" WHERE "occurredAt" IS NULL),
    (SELECT COUNT(*) FROM "OutcomeCategory"),
    (SELECT COUNT(*) FROM "ActivityResult");
END $$;

CREATE TEMP TABLE "_m2_activities_tenant" AS
SELECT t."id" FROM "Tenant" t
WHERE NOT EXISTS (SELECT 1 FROM "ActivityResult" a WHERE a."tenantId" = t."id");

INSERT INTO "ActivityResult" ("id", "tenantId", "nameSq", "nameEn", "order", "updatedAt")
SELECT gen_random_uuid()::text, n."id", v."namesq", v."nameen", v."ord", CURRENT_TIMESTAMP
FROM "_m2_activities_tenant" n
CROSS JOIN (VALUES
  ('U kontaktua – i interesuar', 'Reached – interested', 1),
  ('U kontaktua – jo i interesuar', 'Reached – not interested', 2),
  ('Nuk u kontaktua', 'Not reached', 3),
  ('Telefono më vonë', 'Call back later', 4),
  ('U caktua takim', 'Meeting agreed', 5),
  ('Kërkoi ofertë', 'Offer requested', 6)
) AS v("namesq", "nameen", "ord");

INSERT INTO "ActivityResult" ("id", "tenantId", "nameSq", "nameEn", "order", "updatedAt")
SELECT o."id", o."tenantId", o."label", NULL,
       (6 + ROW_NUMBER() OVER (PARTITION BY o."tenantId" ORDER BY o."label"))::int, CURRENT_TIMESTAMP
FROM "OutcomeCategory" o
JOIN "_m2_activities_tenant" n ON n."id" = o."tenantId"
WHERE NOT EXISTS (SELECT 1 FROM "ActivityResult" a WHERE a."tenantId" = o."tenantId" AND a."nameSq" = o."label")
  AND NOT EXISTS (SELECT 1 FROM "ActivityResult" a WHERE a."id" = o."id");

UPDATE "Interaction" i
SET "resultId" = COALESCE(
  (SELECT a."id" FROM "ActivityResult" a
    WHERE a."id" = i."outcomeCategoryId" AND a."tenantId" = i."tenantId"),
  (SELECT a."id" FROM "ActivityResult" a
    JOIN "OutcomeCategory" o ON o."id" = i."outcomeCategoryId"
    WHERE a."tenantId" = i."tenantId" AND a."nameSq" = o."label"
    ORDER BY a."order" LIMIT 1)
)
WHERE i."occurredAt" IS NULL AND i."resultId" IS NULL AND i."outcomeCategoryId" IS NOT NULL;

UPDATE "Interaction" SET "occurredAt" = "createdAt" WHERE "occurredAt" IS NULL;

DROP TABLE "_m2_activities_tenant";

DO $$ BEGIN
  RAISE NOTICE 'm2 activities after: % interactions, % without occurredAt, % with a result, % activity results',
    (SELECT COUNT(*) FROM "Interaction"),
    (SELECT COUNT(*) FROM "Interaction" WHERE "occurredAt" IS NULL),
    (SELECT COUNT(*) FROM "Interaction" WHERE "resultId" IS NOT NULL),
    (SELECT COUNT(*) FROM "ActivityResult");
END $$;
-- END DATA
