-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "warehouseId" TEXT;

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_warehouseId_idx" ON "StockMovement"("tenantId", "warehouseId");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
