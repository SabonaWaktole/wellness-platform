-- M2 Slice 3: the pricing configuration the Administrator manages from
-- Settings → Pricing (FR-PCF-01..05, 07). Money and percentages are DECIMAL,
-- never floating point (NFR-ACC-02).

-- CreateTable
CREATE TABLE "PricingSettings" (
    "tenantId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "discountCapPercent" DECIMAL(7,2) NOT NULL DEFAULT 10,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingSettings_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "EmployeeBand" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "minEmployees" INTEGER NOT NULL,
    "maxEmployees" INTEGER NOT NULL,
    "baseFee" DECIMAL(12,2) NOT NULL,
    "perEmployeeFee" DECIMAL(12,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeBand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskSurcharge" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "riskLevelId" TEXT NOT NULL,
    "percent" DECIMAL(7,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskSurcharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitFrequency" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nameSq" TEXT NOT NULL,
    "nameEn" TEXT,
    "visitsPerYear" INTEGER,
    "pricingType" TEXT NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitFrequency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceZone" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nameSq" TEXT NOT NULL,
    "nameEn" TEXT,
    "surchargePercent" DECIMAL(7,2) NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceZoneCity" (
    "zoneId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,

    CONSTRAINT "PriceZoneCity_pkey" PRIMARY KEY ("zoneId","cityId")
);

-- CreateIndex
CREATE INDEX "EmployeeBand_tenantId_minEmployees_idx" ON "EmployeeBand"("tenantId", "minEmployees");

-- CreateIndex
CREATE INDEX "RiskSurcharge_riskLevelId_idx" ON "RiskSurcharge"("riskLevelId");

-- CreateIndex
CREATE UNIQUE INDEX "RiskSurcharge_tenantId_riskLevelId_key" ON "RiskSurcharge"("tenantId", "riskLevelId");

-- CreateIndex
CREATE INDEX "VisitFrequency_tenantId_order_idx" ON "VisitFrequency"("tenantId", "order");

-- CreateIndex
CREATE INDEX "PriceZone_tenantId_order_idx" ON "PriceZone"("tenantId", "order");

-- CreateIndex
CREATE INDEX "PriceZoneCity_cityId_idx" ON "PriceZoneCity"("cityId");

-- AddForeignKey
ALTER TABLE "PricingSettings" ADD CONSTRAINT "PricingSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeBand" ADD CONSTRAINT "EmployeeBand_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskSurcharge" ADD CONSTRAINT "RiskSurcharge_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskSurcharge" ADD CONSTRAINT "RiskSurcharge_riskLevelId_fkey" FOREIGN KEY ("riskLevelId") REFERENCES "RiskLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitFrequency" ADD CONSTRAINT "VisitFrequency_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceZone" ADD CONSTRAINT "PriceZone_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceZoneCity" ADD CONSTRAINT "PriceZoneCity_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "PriceZone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceZoneCity" ADD CONSTRAINT "PriceZoneCity_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------
-- Vorë joins the Tiranë area (M1 city list), so the "Kamëz and Vorë" price
-- zone can be seeded. Every workspace with a Tiranë area and no Vorë in it.
-- New workspaces get it from DEFAULT_AREAS in DefaultLookups.ts.
-- ---------------------------------------------------------------
INSERT INTO "City" ("id", "tenantId", "areaId", "nameSq", "nameEn", "order", "updatedAt")
SELECT gen_random_uuid()::text, a."tenantId", a."id", v."namesq", v."nameen", v."ord", CURRENT_TIMESTAMP
FROM "Area" a
CROSS JOIN (VALUES
  ('Tiranë', 'Vorë', 'Vorë', 4)
) AS v("areanamesq", "namesq", "nameen", "ord")
WHERE a."nameSq" = v."areanamesq"
  AND NOT EXISTS (SELECT 1 FROM "City" c WHERE c."areaId" = a."id" AND c."nameSq" = v."namesq");

-- ---------------------------------------------------------------
-- Seed (Q1, Q2, Q3, Q4, Q7): the defaults in
-- src/pricing/domain/DefaultPricing.ts, for every workspace that has none
-- yet. New workspaces get the same values from PrismaPricingSeeder.
-- ---------------------------------------------------------------
INSERT INTO "PricingSettings" ("tenantId", "currency", "discountCapPercent", "updatedAt")
SELECT t."id", 'EUR', 10.00, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE NOT EXISTS (SELECT 1 FROM "PricingSettings" p WHERE p."tenantId" = t."id");

INSERT INTO "EmployeeBand" ("id", "tenantId", "minEmployees", "maxEmployees", "baseFee", "perEmployeeFee", "updatedAt")
SELECT gen_random_uuid()::text, t."id", v."minemployees", v."maxemployees", v."basefee", v."peremployeefee", CURRENT_TIMESTAMP
FROM "Tenant" t
CROSS JOIN (VALUES
  (1, 10, 30.00, 8.00)
) AS v("minemployees", "maxemployees", "basefee", "peremployeefee")
WHERE NOT EXISTS (SELECT 1 FROM "EmployeeBand" b WHERE b."tenantId" = t."id");

INSERT INTO "RiskSurcharge" ("id", "tenantId", "riskLevelId", "percent", "updatedAt")
SELECT gen_random_uuid()::text, t."id", r."id", v."percent", CURRENT_TIMESTAMP
FROM "Tenant" t
CROSS JOIN (VALUES
  (1, 0.00),
  (2, 10.00),
  (3, 20.00)
) AS v("risklevel", "percent")
JOIN "RiskLevel" r ON r."tenantId" = t."id" AND r."level" = v."risklevel"
WHERE NOT EXISTS (SELECT 1 FROM "RiskSurcharge" s WHERE s."tenantId" = t."id");

INSERT INTO "VisitFrequency" ("id", "tenantId", "nameSq", "nameEn", "visitsPerYear", "pricingType", "value", "order", "updatedAt")
SELECT gen_random_uuid()::text, t."id", v."namesq", v."nameen", v."visitsperyear", v."pricingtype", v."value", v."ord", CURRENT_TIMESTAMP
FROM "Tenant" t
CROSS JOIN (VALUES
  ('1 herë në vit', 'Once a year', 1, 'PERCENT', 0.00, 1),
  ('2 herë në vit', 'Twice a year', 2, 'PERCENT', 20.00, 2),
  ('4 herë në vit', '4 times a year', 4, 'PERCENT', 35.00, 3),
  ('6 herë në vit', '6 times a year', 6, 'PERCENT', 50.00, 4),
  ('Çdo muaj', 'Monthly', 12, 'PERCENT', 100.00, 5),
  ('Sipas nevojës', 'Ad hoc', NULL, 'FIXED', 15.00, 6)
) AS v("namesq", "nameen", "visitsperyear", "pricingtype", "value", "ord")
WHERE NOT EXISTS (SELECT 1 FROM "VisitFrequency" f WHERE f."tenantId" = t."id");

INSERT INTO "PriceZone" ("id", "tenantId", "nameSq", "nameEn", "surchargePercent", "order", "updatedAt")
SELECT gen_random_uuid()::text, t."id", v."namesq", v."nameen", v."surchargepercent", v."ord", CURRENT_TIMESTAMP
FROM "Tenant" t
CROSS JOIN (VALUES
  ('Tirana qendër', 'Tirana centre', 0.00, 1),
  ('Tirana periferi', 'Tirana suburbs', 15.00, 2),
  ('Kamëz dhe Vorë', 'Kamëz and Vorë', 30.00, 3),
  ('Elbasan dhe Durrës', 'Elbasan and Durrës', 100.00, 4)
) AS v("namesq", "nameen", "surchargepercent", "ord")
WHERE NOT EXISTS (SELECT 1 FROM "PriceZone" z WHERE z."tenantId" = t."id");

-- Cities are matched by area and city name, since "Tiranë" is unique only
-- within its area. A workspace whose zones already have cities keeps them.
INSERT INTO "PriceZoneCity" ("zoneId", "cityId")
SELECT z."id", c."id"
FROM (VALUES
  ('Tirana qendër', 'Tiranë', 'Tiranë'),
  ('Tirana periferi', 'Tiranë', 'Tiranë'),
  ('Kamëz dhe Vorë', 'Tiranë', 'Kamëz'),
  ('Kamëz dhe Vorë', 'Tiranë', 'Vorë'),
  ('Elbasan dhe Durrës', 'Elbasan', 'Elbasan'),
  ('Elbasan dhe Durrës', 'Durrës', 'Durrës')
) AS v("zonenamesq", "areanamesq", "citynamesq")
JOIN "PriceZone" z ON z."nameSq" = v."zonenamesq"
JOIN "Area" a ON a."tenantId" = z."tenantId" AND a."nameSq" = v."areanamesq"
JOIN "City" c ON c."areaId" = a."id" AND c."nameSq" = v."citynamesq"
WHERE NOT EXISTS (
  SELECT 1 FROM "PriceZoneCity" zc JOIN "PriceZone" oz ON oz."id" = zc."zoneId" WHERE oz."tenantId" = z."tenantId"
);
