-- Product catalogue fields and the product image gallery.
--
-- Every column added here is either nullable or carries a default, so the
-- migration is additive: existing products keep working untouched.
--
-- IF NOT EXISTS guards follow the convention established by the branding
-- media migration — the dev database for this project has drifted ahead of
-- the migration history before, and these statements must stay re-runnable.

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sku" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "brand" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "cost" DOUBLE PRECISION;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "isArchived" BOOLEAN NOT NULL DEFAULT false;

-- SKUs are unique per tenant. Postgres treats NULLs as distinct, so products
-- without a SKU do not collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS "Product_tenantId_sku_key" ON "Product"("tenantId", "sku");
CREATE INDEX IF NOT EXISTS "Product_tenantId_isArchived_idx" ON "Product"("tenantId", "isArchived");

CREATE TABLE IF NOT EXISTS "ProductImage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "url2x" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProductImage_tenantId_productId_position_idx" ON "ProductImage"("tenantId", "productId", "position");

DO $$
BEGIN
    ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Deleting a product takes its gallery rows with it; the files on disk are
-- removed by the delete use case before the row goes.
DO $$
BEGIN
    ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey"
        FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
