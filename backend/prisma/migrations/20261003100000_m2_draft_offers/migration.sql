-- M2 Slice 8: a deal's draft offer (FR-PRC-12, FR-OFR-01, 03, 04). An offer
-- is a Quotation with a deal: every new column is nullable, so the legacy
-- quotations keep working unchanged and get no deal (D5). The amounts are
-- Decimal (NFR-ACC-02). The package's services are copied into
-- QuotationService, not QuotationLineItem, whose product and warehouse are
-- required. Deal gains the current offer's value for the board and the list.

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "offerAnnualValue" DECIMAL(12,2),
ADD COLUMN     "offerNetMonthlyPrice" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "annualValue" DECIMAL(12,2),
ADD COLUMN     "baseFee" DECIMAL(12,2),
ADD COLUMN     "dealId" TEXT,
ADD COLUMN     "discountAmount" DECIMAL(12,2),
ADD COLUMN     "discountPercent" DECIMAL(7,2),
ADD COLUMN     "employeesPriced" INTEGER,
ADD COLUMN     "frequencyId" TEXT,
ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'sq',
ADD COLUMN     "listPrice" DECIMAL(12,2),
ADD COLUMN     "locationFee" DECIMAL(12,2),
ADD COLUMN     "netMonthlyPrice" DECIMAL(12,2),
ADD COLUMN     "note" TEXT,
ADD COLUMN     "packageId" TEXT,
ADD COLUMN     "pricePerEmployee" DECIMAL(12,2),
ADD COLUMN     "pricingInputs" JSONB,
ADD COLUMN     "riskFee" DECIMAL(12,2),
ADD COLUMN     "ruleSnapshot" JSONB,
ADD COLUMN     "visitFee" DECIMAL(12,2),
ADD COLUMN     "zoneId" TEXT;

-- CreateTable
CREATE TABLE "QuotationService" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "serviceId" TEXT,
    "nameSq" TEXT NOT NULL,
    "nameEn" TEXT,
    "descriptionSq" TEXT,
    "descriptionEn" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuotationService_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuotationService_tenantId_quotationId_idx" ON "QuotationService"("tenantId", "quotationId");

-- CreateIndex
CREATE INDEX "QuotationService_quotationId_idx" ON "QuotationService"("quotationId");

-- CreateIndex
CREATE INDEX "QuotationService_serviceId_idx" ON "QuotationService"("serviceId");

-- CreateIndex
CREATE INDEX "Deal_tenantId_stageKey_offerNetMonthlyPrice_idx" ON "Deal"("tenantId", "stageKey", "offerNetMonthlyPrice");

-- CreateIndex
CREATE INDEX "Quotation_tenantId_dealId_status_idx" ON "Quotation"("tenantId", "dealId", "status");

-- CreateIndex
CREATE INDEX "Quotation_dealId_idx" ON "Quotation"("dealId");

-- CreateIndex
CREATE INDEX "Quotation_packageId_idx" ON "Quotation"("packageId");

-- CreateIndex
CREATE INDEX "Quotation_frequencyId_idx" ON "Quotation"("frequencyId");

-- CreateIndex
CREATE INDEX "Quotation_zoneId_idx" ON "Quotation"("zoneId");

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "ServicePackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_frequencyId_fkey" FOREIGN KEY ("frequencyId") REFERENCES "VisitFrequency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "PriceZone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationService" ADD CONSTRAINT "QuotationService_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationService" ADD CONSTRAINT "QuotationService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

