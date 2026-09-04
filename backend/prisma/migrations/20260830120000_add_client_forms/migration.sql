-- Tenant-authored client intake forms (the drag-and-drop form builder).
--
-- Additive only: nothing about Client or CustomFieldDefinition changes. Forms
-- are a presentation layer over the existing tenant field dictionary, so every
-- existing client, search, report and PDF path is untouched by this migration.

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "clientFormSeededAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ClientForm" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    -- No DEFAULT: the application always writes a layout, and MySQL (the other
    -- provider this schema is mirrored to) cannot take a literal default on a
    -- JSON column. Keeping both providers identical is worth more than the
    -- convenience here.
    "layout" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ClientForm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientForm_tenantId_name_key" ON "ClientForm"("tenantId", "name");

-- CreateIndex
CREATE INDEX "ClientForm_tenantId_deletedAt_idx" ON "ClientForm"("tenantId", "deletedAt");

-- AddForeignKey
ALTER TABLE "ClientForm" ADD CONSTRAINT "ClientForm_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- No backfill. Every tenant's starter form is created lazily on the first read
-- by EnsureDefaultClientFormUseCase, which stamps clientFormSeededAt so the
-- form is built exactly once and a deleted form stays deleted. Backfilling here
-- instead would have to duplicate that seeding logic in SQL and would run
-- against tenants who may never open the builder at all.
