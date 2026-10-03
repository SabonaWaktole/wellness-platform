-- M2 Slice 10: discount approvals above the cap (FR-DSC-03..12, FR-DSC-12
-- reminder hours). Discount-only: manual prices (FR-PRC-09) are deferred.
-- DiscountApproval holds what was asked and decided; amounts stay on the
-- offer. The reminder interval lives on NotificationSettings (default 24,
-- admin-controlled in Settings → Notifications).

-- AlterTable
ALTER TABLE "NotificationSettings" ADD COLUMN "discountApprovalReminderHours" INTEGER NOT NULL DEFAULT 24;

-- CreateTable
CREATE TABLE "DiscountApproval" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "requestedPercent" DECIMAL(7,2) NOT NULL,
    "listPriceAtRequest" DECIMAL(12,2) NOT NULL,
    "approvedPercent" DECIMAL(7,2),
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "comment" TEXT,
    "remindedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscountApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiscountApproval_tenantId_status_createdAt_idx" ON "DiscountApproval"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "DiscountApproval_tenantId_quotationId_idx" ON "DiscountApproval"("tenantId", "quotationId");

-- CreateIndex
CREATE INDEX "DiscountApproval_quotationId_idx" ON "DiscountApproval"("quotationId");

-- AddForeignKey
ALTER TABLE "DiscountApproval" ADD CONSTRAINT "DiscountApproval_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountApproval" ADD CONSTRAINT "DiscountApproval_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountApproval" ADD CONSTRAINT "DiscountApproval_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountApproval" ADD CONSTRAINT "DiscountApproval_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
