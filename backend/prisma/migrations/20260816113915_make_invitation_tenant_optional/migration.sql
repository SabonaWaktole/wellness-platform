-- DropForeignKey
ALTER TABLE "Invitation" DROP CONSTRAINT "Invitation_tenantId_fkey";

-- AlterTable
ALTER TABLE "Invitation" ALTER COLUMN "tenantId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
