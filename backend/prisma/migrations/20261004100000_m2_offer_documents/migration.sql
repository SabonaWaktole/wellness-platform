-- M2 Slice 9: offer numbers, versions and validity (FR-OFR-08, 10, 11), the
-- frozen render snapshot (D2) and the chosen contact (FR-OFR-02).
-- DocumentSequence hands out the next number per tenant, kind and year under
-- a row lock (D5). The data section numbers every existing quotation once,
-- per tenant and per UTC year of createdAt, in createdAt order, with the
-- tenant's offer prefix (default OF), and sets each counter past the last
-- number used (NFR-OPS-02). It only touches rows without a number, so it is
-- safe to run twice; prisma/mysql_migration_m2_offer_documents.sql does the
-- same on MySQL. Wellness Albania switches to the sales process (D6).

-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "contactPersonId" TEXT,
ADD COLUMN     "number" TEXT,
ADD COLUMN     "previousVersionId" TEXT,
ADD COLUMN     "readyAt" TIMESTAMP(3),
ADD COLUMN     "renderSnapshot" JSONB,
ADD COLUMN     "supersededAt" TIMESTAMP(3),
ADD COLUMN     "validUntil" DATE,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "DocumentSequence" (
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "next" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "DocumentSequence_pkey" PRIMARY KEY ("tenantId","kind","year")
);

-- CreateIndex
CREATE INDEX "Quotation_tenantId_status_validUntil_idx" ON "Quotation"("tenantId", "status", "validUntil");

-- CreateIndex
CREATE INDEX "Quotation_contactPersonId_idx" ON "Quotation"("contactPersonId");

-- CreateIndex
CREATE INDEX "Quotation_previousVersionId_idx" ON "Quotation"("previousVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_tenantId_number_version_key" ON "Quotation"("tenantId", "number", "version");

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_contactPersonId_fkey" FOREIGN KEY ("contactPersonId") REFERENCES "ContactPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSequence" ADD CONSTRAINT "DocumentSequence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- BEGIN DATA
CREATE TEMP TABLE "_m2_offer_numbers" AS
SELECT q."id", q."tenantId",
       EXTRACT(YEAR FROM q."createdAt")::int AS "year",
       ROW_NUMBER() OVER (
         PARTITION BY q."tenantId", EXTRACT(YEAR FROM q."createdAt")
         ORDER BY q."createdAt", q."id"
       )::int AS "rank"
FROM "Quotation" q
WHERE q."number" IS NULL;

INSERT INTO "DocumentSequence" ("tenantId", "kind", "year", "next")
SELECT DISTINCT n."tenantId", 'OFFER', n."year", 1
FROM "_m2_offer_numbers" n
ON CONFLICT DO NOTHING;

UPDATE "Quotation" q
SET "number" = COALESCE(ps."offerNumberPrefix", 'OF') || '-' || n."year" || '-'
  || LPAD((s."next" - 1 + n."rank")::text, GREATEST(4, LENGTH((s."next" - 1 + n."rank")::text)), '0')
FROM "_m2_offer_numbers" n
JOIN "DocumentSequence" s ON s."tenantId" = n."tenantId" AND s."kind" = 'OFFER' AND s."year" = n."year"
LEFT JOIN "PricingSettings" ps ON ps."tenantId" = n."tenantId"
WHERE q."id" = n."id";

UPDATE "DocumentSequence" s
SET "next" = s."next" + c."count"
FROM (
  SELECT "tenantId", "year", COUNT(*)::int AS "count"
  FROM "_m2_offer_numbers"
  GROUP BY "tenantId", "year"
) c
WHERE s."tenantId" = c."tenantId" AND s."kind" = 'OFFER' AND s."year" = c."year";

DROP TABLE "_m2_offer_numbers";

UPDATE "Tenant" SET "salesWorkflow" = 'SALES_PROCESS' WHERE "urlSlug" = 'wellness-albania';

DO $$ BEGIN
  RAISE NOTICE 'm2 offer documents after: % quotations, % without a number, % sequences',
    (SELECT COUNT(*) FROM "Quotation"),
    (SELECT COUNT(*) FROM "Quotation" WHERE "number" IS NULL),
    (SELECT COUNT(*) FROM "DocumentSequence");
END $$;
-- END DATA
