-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Client_tenantId_deletedAt_idx" ON "Client"("tenantId", "deletedAt");
