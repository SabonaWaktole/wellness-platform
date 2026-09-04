-- Form versioning, publishing, templates and structured submissions.
--
-- Additive only: four new nullable/defaulted columns on ClientForm and two new
-- tables. No existing row is read, rewritten or dropped, and nothing about
-- Client or CustomFieldDefinition changes.
--
-- The one column needing care is ClientForm."settings": it is JSONB NOT NULL
-- with no DEFAULT (MySQL, the other provider this schema is mirrored to,
-- cannot take a literal default on a JSON column), so existing rows are
-- backfilled to '{}' in the same statement that adds it.

-- AlterTable
ALTER TABLE "ClientForm" ADD COLUMN     "shareToken" TEXT;
ALTER TABLE "ClientForm" ADD COLUMN     "isTemplate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ClientForm" ADD COLUMN     "publishedVersionId" TEXT;
ALTER TABLE "ClientForm" ADD COLUMN     "settings" JSONB NOT NULL DEFAULT '{}';
-- Drop the default now that every existing row has a value: the application
-- always writes this column, and keeping a DEFAULT here would let the two
-- providers drift (MySQL cannot express it).
ALTER TABLE "ClientForm" ALTER COLUMN "settings" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "ClientForm_shareToken_key" ON "ClientForm"("shareToken");

-- CreateTable
CREATE TABLE "FormVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "document" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedByUserId" TEXT,

    CONSTRAINT "FormVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormSubmission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "formVersionId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedByUserId" TEXT,
    "clientId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'PUBLIC_LINK',
    "ipHash" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "FormSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FormVersion_formId_versionNumber_key" ON "FormVersion"("formId", "versionNumber");
CREATE INDEX "FormVersion_tenantId_formId_idx" ON "FormVersion"("tenantId", "formId");
CREATE INDEX "FormSubmission_tenantId_formId_submittedAt_idx" ON "FormSubmission"("tenantId", "formId", "submittedAt");
CREATE INDEX "FormSubmission_tenantId_submittedAt_idx" ON "FormSubmission"("tenantId", "submittedAt");

-- AddForeignKey
-- RESTRICT everywhere, matching ClientForm_tenantId_fkey: a published version
-- must outlive edits to the form it came from, because a FormSubmission is
-- pinned to it and would otherwise become unrenderable.
ALTER TABLE "FormVersion" ADD CONSTRAINT "FormVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FormVersion" ADD CONSTRAINT "FormVersion_formId_fkey" FOREIGN KEY ("formId") REFERENCES "ClientForm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_formId_fkey" FOREIGN KEY ("formId") REFERENCES "ClientForm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_formVersionId_fkey" FOREIGN KEY ("formVersionId") REFERENCES "FormVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
