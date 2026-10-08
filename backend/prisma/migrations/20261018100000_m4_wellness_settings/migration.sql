-- M4 Slice 3: Wellness+ settings and benefit table (FR-TIR-01, FR-TIR-05,
-- FR-TIR-10, FR-MEM-03, FR-MPAY-05, FR-FAM-02, FR-FAM-04, FR-VIP-04,
-- FR-BEN-01, FR-BEN-02). The seed below gives every existing workspace the
-- defaults of src/membership/domain/DefaultMembership.ts; new workspaces get
-- them from PrismaMembershipSeeder. Every INSERT is guarded, so a re-run adds
-- nothing (NFR-OPS-04).

-- CreateTable
CREATE TABLE "TierSetting" (
    "tenantId" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "labelSq" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "colour" TEXT NOT NULL,
    "fee" DECIMAL(12,2),
    "termMonths" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" TEXT,

    CONSTRAINT "TierSetting_pkey" PRIMARY KEY ("tenantId","tier")
);

-- CreateTable
CREATE TABLE "MembershipSettings" (
    "tenantId" TEXT NOT NULL,
    "familyDiscountPercent" DECIMAL(7,2) NOT NULL DEFAULT 50,
    "graceDays" INTEGER NOT NULL DEFAULT 0,
    "expiringSoonDays" INTEGER NOT NULL DEFAULT 30,
    "memberPrefix" TEXT NOT NULL DEFAULT 'WP',
    "receiptPrefix" TEXT NOT NULL DEFAULT 'RCP',
    "vipReviewNoticeDays" INTEGER NOT NULL DEFAULT 30,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" TEXT,

    CONSTRAINT "MembershipSettings_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "FamilyRelationship" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nameSq" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "FamilyRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenefitService" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nameSq" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "BenefitService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenefitDiscount" (
    "serviceId" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "percent" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "BenefitDiscount_pkey" PRIMARY KEY ("serviceId","tier")
);

-- CreateIndex
CREATE INDEX "FamilyRelationship_tenantId_order_idx" ON "FamilyRelationship"("tenantId", "order");

-- CreateIndex
CREATE INDEX "BenefitService_tenantId_order_idx" ON "BenefitService"("tenantId", "order");

-- AddForeignKey
ALTER TABLE "TierSetting" ADD CONSTRAINT "TierSetting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipSettings" ADD CONSTRAINT "MembershipSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyRelationship" ADD CONSTRAINT "FamilyRelationship_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitService" ADD CONSTRAINT "BenefitService_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitDiscount" ADD CONSTRAINT "BenefitDiscount_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "BenefitService"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- BEGIN GENERATED MEMBERSHIP SEED
INSERT INTO "TierSetting" ("tenantId", "tier", "labelSq", "labelEn", "colour", "fee", "termMonths", "updatedAt")
SELECT t."id", v."tier", v."labelsq", v."labelen", v."colour", v."fee"::numeric(12,2), v."termmonths"::integer, CURRENT_TIMESTAMP
FROM "Tenant" t
CROSS JOIN (VALUES
  ('BRONZE', 'Bronz', 'Bronze', '#B26A2B', NULL, NULL),
  ('SILVER', 'Argjend', 'Silver', '#8A939B', 60.00, 12),
  ('GOLD', 'Ar', 'Gold', '#C9A227', 100.00, 12),
  ('VIP', 'VIP', 'VIP', '#5B3FA6', NULL, 12)
) AS v("tier", "labelsq", "labelen", "colour", "fee", "termmonths")
WHERE NOT EXISTS (SELECT 1 FROM "TierSetting" x WHERE x."tenantId" = t."id");

INSERT INTO "MembershipSettings" ("tenantId", "familyDiscountPercent", "graceDays", "expiringSoonDays", "memberPrefix", "receiptPrefix", "vipReviewNoticeDays", "updatedAt")
SELECT t."id", 50.00, 0, 30, 'WP', 'RCP', 30, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE NOT EXISTS (SELECT 1 FROM "MembershipSettings" x WHERE x."tenantId" = t."id");

INSERT INTO "FamilyRelationship" ("id", "tenantId", "nameSq", "nameEn", "order")
SELECT gen_random_uuid()::text, t."id", v."namesq", v."nameen", v."ord"
FROM "Tenant" t
CROSS JOIN (VALUES
  ('Bashkëshort ose partner', 'Spouse or partner', 1),
  ('Fëmijë', 'Child', 2),
  ('Prind', 'Parent', 3)
) AS v("namesq", "nameen", "ord")
WHERE NOT EXISTS (SELECT 1 FROM "FamilyRelationship" x WHERE x."tenantId" = t."id");

INSERT INTO "BenefitService" ("id", "tenantId", "nameSq", "nameEn", "order")
SELECT gen_random_uuid()::text, t."id", v."namesq", v."nameen", v."ord"
FROM "Tenant" t
CROSS JOIN (VALUES
  ('Kontroll parandalues', 'Preventive check-up', 1),
  ('Qasje te internisti', 'Internist access', 2),
  ('Masazh relaksues ose sportiv (ose 1 seancë fizioterapie për një gjendje ekzistuese)', 'Relaxing or sports massage (or 1 physiotherapy session for an existing condition)', 3),
  ('Ekzaminime radiologjike', 'Radiology examinations', 4),
  ('Vizita te gjinekologu', 'Gynecologist visits', 5),
  ('Vizita te kardiologu', 'Cardiologist visits', 6),
  ('Vizita te reumatologu', 'Rheumatologist visits', 7),
  ('Vizita te dermatologu', 'Dermatologist visits', 8),
  ('Vizita te endokrinologu', 'Endocrinologist visits', 9),
  ('Vizita te pediatri', 'Pediatrician visits', 10),
  ('Shërbime infermierore në shtëpi', 'Home nursing services', 11),
  ('Seanca fizioterapie dhe rehabilitimi fizik', 'Physiotherapy and physical rehabilitation sessions', 12),
  ('Analiza laboratorike', 'Laboratory tests', 13),
  ('Skaner CT (të gjitha llojet)', 'CT scan (all types)', 14)
) AS v("namesq", "nameen", "ord")
WHERE NOT EXISTS (SELECT 1 FROM "BenefitService" x WHERE x."tenantId" = t."id");

-- Only a workspace with no discount at all gets the seeded ones, so a re-run never
-- puts back a discount the Administrator cleared.
INSERT INTO "BenefitDiscount" ("serviceId", "tier", "percent")
SELECT s."id", v."tier", v."percent"::numeric(5,2)
FROM (VALUES
  ('Preventive check-up', 'BRONZE', 25.00),
  ('Preventive check-up', 'SILVER', 50.00),
  ('Preventive check-up', 'GOLD', 100.00),
  ('Preventive check-up', 'VIP', 100.00),
  ('Internist access', 'BRONZE', 100.00),
  ('Internist access', 'SILVER', 100.00),
  ('Internist access', 'GOLD', 100.00),
  ('Internist access', 'VIP', 100.00),
  ('Relaxing or sports massage (or 1 physiotherapy session for an existing condition)', 'GOLD', 100.00),
  ('Relaxing or sports massage (or 1 physiotherapy session for an existing condition)', 'VIP', 100.00),
  ('Radiology examinations', 'GOLD', 50.00),
  ('Radiology examinations', 'VIP', 50.00),
  ('Gynecologist visits', 'BRONZE', 10.00),
  ('Gynecologist visits', 'SILVER', 20.00),
  ('Gynecologist visits', 'GOLD', 30.00),
  ('Gynecologist visits', 'VIP', 30.00),
  ('Cardiologist visits', 'BRONZE', 10.00),
  ('Cardiologist visits', 'SILVER', 20.00),
  ('Cardiologist visits', 'GOLD', 30.00),
  ('Cardiologist visits', 'VIP', 30.00),
  ('Rheumatologist visits', 'BRONZE', 10.00),
  ('Rheumatologist visits', 'SILVER', 20.00),
  ('Rheumatologist visits', 'GOLD', 30.00),
  ('Rheumatologist visits', 'VIP', 30.00),
  ('Dermatologist visits', 'BRONZE', 10.00),
  ('Dermatologist visits', 'SILVER', 15.00),
  ('Dermatologist visits', 'GOLD', 30.00),
  ('Dermatologist visits', 'VIP', 30.00),
  ('Endocrinologist visits', 'BRONZE', 10.00),
  ('Endocrinologist visits', 'SILVER', 20.00),
  ('Endocrinologist visits', 'GOLD', 30.00),
  ('Endocrinologist visits', 'VIP', 30.00),
  ('Pediatrician visits', 'BRONZE', 10.00),
  ('Pediatrician visits', 'SILVER', 20.00),
  ('Pediatrician visits', 'GOLD', 30.00),
  ('Pediatrician visits', 'VIP', 30.00),
  ('Home nursing services', 'BRONZE', 10.00),
  ('Home nursing services', 'GOLD', 30.00),
  ('Home nursing services', 'VIP', 30.00),
  ('Physiotherapy and physical rehabilitation sessions', 'BRONZE', 10.00),
  ('Physiotherapy and physical rehabilitation sessions', 'SILVER', 20.00),
  ('Physiotherapy and physical rehabilitation sessions', 'GOLD', 30.00),
  ('Physiotherapy and physical rehabilitation sessions', 'VIP', 30.00),
  ('Laboratory tests', 'SILVER', 15.00)
) AS v("nameen", "tier", "percent")
JOIN "BenefitService" s ON s."nameEn" = v."nameen"
WHERE NOT EXISTS (
  SELECT 1 FROM "BenefitDiscount" d JOIN "BenefitService" s2 ON s2."id" = d."serviceId" WHERE s2."tenantId" = s."tenantId"
);
-- END GENERATED MEMBERSHIP SEED
