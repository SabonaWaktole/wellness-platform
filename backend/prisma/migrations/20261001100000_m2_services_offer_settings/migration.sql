-- M2 Slice 4: services, service packages and the offer settings the
-- Administrator manages from Settings → Pricing (FR-PCF-06, FR-PCF-08). The
-- offer texts are TipTap JSON, sanitised on the server (plan D10, NFR-SEC-05).

-- AlterTable
ALTER TABLE "PricingSettings" ADD COLUMN     "address" TEXT,
ADD COLUMN     "bankDetails" TEXT,
ADD COLUMN     "closingEn" JSONB,
ADD COLUMN     "closingSq" JSONB,
ADD COLUMN     "companyName" TEXT,
ADD COLUMN     "contractMonthsDefault" INTEGER NOT NULL DEFAULT 12,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "introEn" JSONB,
ADD COLUMN     "introSq" JSONB,
ADD COLUMN     "nipt" TEXT,
ADD COLUMN     "offerNumberPrefix" TEXT NOT NULL DEFAULT 'OF',
ADD COLUMN     "offerValidityDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "termsEn" JSONB,
ADD COLUMN     "termsSq" JSONB,
ADD COLUMN     "website" TEXT;

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nameSq" TEXT NOT NULL,
    "nameEn" TEXT,
    "descriptionSq" TEXT,
    "descriptionEn" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServicePackage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nameSq" TEXT NOT NULL,
    "nameEn" TEXT,
    "descriptionSq" TEXT,
    "descriptionEn" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServicePackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageService" (
    "packageId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PackageService_pkey" PRIMARY KEY ("packageId","serviceId")
);

-- CreateIndex
CREATE INDEX "Service_tenantId_order_idx" ON "Service"("tenantId", "order");

-- CreateIndex
CREATE INDEX "ServicePackage_tenantId_order_idx" ON "ServicePackage"("tenantId", "order");

-- CreateIndex
CREATE INDEX "PackageService_serviceId_idx" ON "PackageService"("serviceId");

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePackage" ADD CONSTRAINT "ServicePackage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageService" ADD CONSTRAINT "PackageService_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "ServicePackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageService" ADD CONSTRAINT "PackageService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------
-- Seed (Q5, Q6, Q9, Q11): the defaults in
-- src/pricing/domain/DefaultOfferSettings.ts, for every workspace that has
-- none yet. New workspaces get the same values from PrismaPricingSeeder.
-- ---------------------------------------------------------------

-- The offer settings: the workspace name as the company name until the
-- Administrator fills in the details, and the standard texts. The numbers
-- came with their column defaults above.
UPDATE "PricingSettings" p
SET "companyName" = t."name",
    "introSq" = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Ju falënderojmë për interesin tuaj. Më poshtë gjeni ofertën tonë për shërbimet e sigurisë dhe shëndetit në punë."}]}]}'::jsonb,
    "introEn" = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Thank you for your interest. Below is our offer for health and safety services at work."}]}]}'::jsonb,
    "termsSq" = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Çmimet janë mujore, në EUR."}]},{"type":"paragraph","content":[{"type":"text","text":"TVSH nuk përfshihet."}]}]}'::jsonb,
    "termsEn" = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Prices are monthly, in EUR."}]},{"type":"paragraph","content":[{"type":"text","text":"VAT not included."}]}]}'::jsonb,
    "closingSq" = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Mbetemi në dispozicion për çdo pyetje."}]}]}'::jsonb,
    "closingEn" = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"We remain at your disposal for any questions."}]}]}'::jsonb
FROM "Tenant" t
WHERE t."id" = p."tenantId";

INSERT INTO "Service" ("id", "tenantId", "nameSq", "nameEn", "descriptionSq", "descriptionEn", "order", "updatedAt")
SELECT gen_random_uuid()::text, t."id", v."namesq", v."nameen", v."descriptionsq", v."descriptionen", v."ord", CURRENT_TIMESTAMP
FROM "Tenant" t
CROSS JOIN (VALUES
  ('Vlerësimi i riskut', 'Risk assessment', 'Vlerësimi i rreziqeve për sigurinë dhe shëndetin në vendin e punës.', 'Assessment of the health and safety risks at the workplace.', 1),
  ('Vizita mjekësore në punë', 'Occupational health visits', 'Vizitat e mjekut të punës në objekt, sipas frekuencës së zgjedhur.', 'Visits of the occupational physician on site, at the chosen frequency.', 2),
  ('Trajnim për sigurinë dhe shëndetin në punë', 'Health and safety training', 'Trajnimi i punonjësve për sigurinë dhe shëndetin në punë.', 'Training of the employees in health and safety at work.', 3)
) AS v("namesq", "nameen", "descriptionsq", "descriptionen", "ord")
WHERE NOT EXISTS (SELECT 1 FROM "Service" s WHERE s."tenantId" = t."id");

INSERT INTO "ServicePackage" ("id", "tenantId", "nameSq", "nameEn", "descriptionSq", "descriptionEn", "isDefault", "order", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'Standart', 'Standard', 'Paketa standarde e shërbimeve.', 'The standard package of services.', true, 1, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE NOT EXISTS (SELECT 1 FROM "ServicePackage" sp WHERE sp."tenantId" = t."id");

-- The default package holds every default service, in order. Services are
-- matched by name within the workspace; a package that already has services
-- keeps them.
INSERT INTO "PackageService" ("packageId", "serviceId", "order")
SELECT sp."id", s."id", v."ord"
FROM (VALUES
  ('Vlerësimi i riskut', 1),
  ('Vizita mjekësore në punë', 2),
  ('Trajnim për sigurinë dhe shëndetin në punë', 3)
) AS v("servicenamesq", "ord")
JOIN "ServicePackage" sp ON sp."nameSq" = 'Standart' AND sp."isDefault" = true
JOIN "Service" s ON s."tenantId" = sp."tenantId" AND s."nameSq" = v."servicenamesq"
WHERE NOT EXISTS (SELECT 1 FROM "PackageService" ps WHERE ps."packageId" = sp."id");
