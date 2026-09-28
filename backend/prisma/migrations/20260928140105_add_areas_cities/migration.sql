-- Slice 9 (FR-SET-03, 04): admin-managed areas, and the cities in each area.
-- CreateTable
CREATE TABLE "Area" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nameSq" TEXT NOT NULL,
    "nameEn" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Area_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "City" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "nameSq" TEXT NOT NULL,
    "nameEn" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Area_tenantId_order_idx" ON "Area"("tenantId", "order");

-- CreateIndex
CREATE INDEX "City_tenantId_areaId_order_idx" ON "City"("tenantId", "areaId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "City_tenantId_areaId_nameSq_key" ON "City"("tenantId", "areaId", "nameSq");

-- AddForeignKey
ALTER TABLE "Area" ADD CONSTRAINT "Area_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "City" ADD CONSTRAINT "City_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "City" ADD CONSTRAINT "City_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------
-- Seed data (FR-SET-10): the placeholder lists in
-- src/lookups/domain/DefaultLookups.ts, for every workspace that has none
-- yet. New workspaces get the same lists from PrismaLookupSeeder.
-- ---------------------------------------------------------------
INSERT INTO "Area" ("id", "tenantId", "nameSq", "nameEn", "order", "updatedAt")
SELECT gen_random_uuid()::text, t."id", v."namesq", v."nameen", v."ord", CURRENT_TIMESTAMP
FROM "Tenant" t
CROSS JOIN (VALUES
  ('Berat', 'Berat', 1),
  ('Dibër', 'Dibër', 2),
  ('Durrës', 'Durrës', 3),
  ('Elbasan', 'Elbasan', 4),
  ('Fier', 'Fier', 5),
  ('Gjirokastër', 'Gjirokastër', 6),
  ('Korçë', 'Korçë', 7),
  ('Kukës', 'Kukës', 8),
  ('Lezhë', 'Lezhë', 9),
  ('Shkodër', 'Shkodër', 10),
  ('Tiranë', 'Tirana', 11),
  ('Vlorë', 'Vlorë', 12)
) AS v("namesq", "nameen", "ord")
WHERE NOT EXISTS (SELECT 1 FROM "Area" a WHERE a."tenantId" = t."id");

INSERT INTO "City" ("id", "tenantId", "areaId", "nameSq", "nameEn", "order", "updatedAt")
SELECT gen_random_uuid()::text, t."id", a."id", v."namesq", v."nameen", v."ord", CURRENT_TIMESTAMP
FROM "Tenant" t
CROSS JOIN (VALUES
  ('Berat', 'Berat', 'Berat', 1),
  ('Berat', 'Kuçovë', 'Kuçovë', 2),
  ('Berat', 'Ura Vajgurore', 'Ura Vajgurore', 3),
  ('Dibër', 'Peshkopi', 'Peshkopi', 1),
  ('Dibër', 'Bulqizë', 'Bulqizë', 2),
  ('Dibër', 'Burrel', 'Burrel', 3),
  ('Durrës', 'Durrës', 'Durrës', 1),
  ('Durrës', 'Shijak', 'Shijak', 2),
  ('Durrës', 'Krujë', 'Krujë', 3),
  ('Elbasan', 'Elbasan', 'Elbasan', 1),
  ('Elbasan', 'Cërrik', 'Cërrik', 2),
  ('Elbasan', 'Librazhd', 'Librazhd', 3),
  ('Fier', 'Fier', 'Fier', 1),
  ('Fier', 'Patos', 'Patos', 2),
  ('Fier', 'Lushnjë', 'Lushnjë', 3),
  ('Gjirokastër', 'Gjirokastër', 'Gjirokastër', 1),
  ('Gjirokastër', 'Tepelenë', 'Tepelenë', 2),
  ('Gjirokastër', 'Përmet', 'Përmet', 3),
  ('Korçë', 'Korçë', 'Korçë', 1),
  ('Korçë', 'Pogradec', 'Pogradec', 2),
  ('Korçë', 'Bilisht', 'Bilisht', 3),
  ('Kukës', 'Kukës', 'Kukës', 1),
  ('Kukës', 'Krumë', 'Krumë', 2),
  ('Kukës', 'Has', 'Has', 3),
  ('Lezhë', 'Lezhë', 'Lezhë', 1),
  ('Lezhë', 'Laç', 'Laç', 2),
  ('Lezhë', 'Rrëshen', 'Rrëshen', 3),
  ('Shkodër', 'Shkodër', 'Shkodër', 1),
  ('Shkodër', 'Koplik', 'Koplik', 2),
  ('Shkodër', 'Vau i Dejës', 'Vau i Dejës', 3),
  ('Tiranë', 'Tiranë', 'Tirana', 1),
  ('Tiranë', 'Kamëz', 'Kamëz', 2),
  ('Tiranë', 'Kavajë', 'Kavajë', 3),
  ('Vlorë', 'Vlorë', 'Vlorë', 1),
  ('Vlorë', 'Sarandë', 'Sarandë', 2),
  ('Vlorë', 'Himarë', 'Himarë', 3)
) AS v("area_namesq", "namesq", "nameen", "ord")
JOIN "Area" a ON a."tenantId" = t."id" AND a."nameSq" = v."area_namesq"
WHERE NOT EXISTS (SELECT 1 FROM "City" c WHERE c."tenantId" = t."id");
