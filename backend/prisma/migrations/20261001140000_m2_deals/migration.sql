-- M2 Slice 6: deals and their stage history (FR-DEAL-01, 06, 09). The stage
-- keys are fixed in StatusCatalogue.ts (domain DEAL), so the status labels
-- need no migration. The won and lost columns are filled by Slice 13.

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT,
    "stageKey" TEXT NOT NULL,
    "expectedCloseDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "wonAt" TIMESTAMP(3),
    "lostAt" TIMESTAMP(3),
    "lostReasonId" TEXT,
    "lostNote" TEXT,
    "agreedMonthlyPrice" DECIMAL(12,2),
    "agreedAnnualValue" DECIMAL(12,2),
    "packageId" TEXT,
    "wonQuotationId" TEXT,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealStageHistory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "fromStage" TEXT,
    "toStage" TEXT NOT NULL,
    "changedByUserId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "DealStageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Deal_tenantId_ownerUserId_stageKey_idx" ON "Deal"("tenantId", "ownerUserId", "stageKey");

-- CreateIndex
CREATE INDEX "Deal_tenantId_clientId_idx" ON "Deal"("tenantId", "clientId");

-- CreateIndex
CREATE INDEX "Deal_tenantId_stageKey_updatedAt_idx" ON "Deal"("tenantId", "stageKey", "updatedAt");

-- CreateIndex
CREATE INDEX "Deal_ownerUserId_idx" ON "Deal"("ownerUserId");

-- CreateIndex
CREATE INDEX "Deal_createdByUserId_idx" ON "Deal"("createdByUserId");

-- CreateIndex
CREATE INDEX "Deal_lostReasonId_idx" ON "Deal"("lostReasonId");

-- CreateIndex
CREATE INDEX "Deal_packageId_idx" ON "Deal"("packageId");

-- CreateIndex
CREATE INDEX "Deal_wonQuotationId_idx" ON "Deal"("wonQuotationId");

-- CreateIndex
CREATE INDEX "DealStageHistory_tenantId_dealId_at_idx" ON "DealStageHistory"("tenantId", "dealId", "at");

-- CreateIndex
CREATE INDEX "DealStageHistory_dealId_idx" ON "DealStageHistory"("dealId");

-- CreateIndex
CREATE INDEX "DealStageHistory_changedByUserId_idx" ON "DealStageHistory"("changedByUserId");

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_lostReasonId_fkey" FOREIGN KEY ("lostReasonId") REFERENCES "LostReason"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "ServicePackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_wonQuotationId_fkey" FOREIGN KEY ("wonQuotationId") REFERENCES "Quotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealStageHistory" ADD CONSTRAINT "DealStageHistory_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealStageHistory" ADD CONSTRAINT "DealStageHistory_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
