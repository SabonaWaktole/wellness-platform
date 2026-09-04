-- AlterTable
ALTER TABLE "Client" ALTER COLUMN "name" DROP NOT NULL,
ALTER COLUMN "status" DROP NOT NULL;

-- AlterTable
ALTER TABLE "CustomFieldDefinition" ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "required" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "role" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldDefinition_tenantId_role_key" ON "CustomFieldDefinition"("tenantId", "role");

