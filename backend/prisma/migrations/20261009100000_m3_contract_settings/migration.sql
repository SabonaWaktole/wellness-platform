-- M3 Slice 3: contract settings (FR-REN-01, FR-REN-04, FR-PAY-09, FR-CON-05).
-- One row per workspace, created lazily when the Administrator first saves;
-- a workspace with no row is on the defaults, so nothing is inserted here.

-- CreateTable
CREATE TABLE "ContractSettings" (
    "tenantId" TEXT NOT NULL,
    "reminderLeadDays" JSONB NOT NULL DEFAULT '[60,30,7]',
    "expiringSoonDays" INTEGER NOT NULL DEFAULT 30,
    "paymentGraceDays" INTEGER NOT NULL DEFAULT 0,
    "numberPrefix" TEXT NOT NULL DEFAULT 'CTR',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" TEXT,

    CONSTRAINT "ContractSettings_pkey" PRIMARY KEY ("tenantId")
);

-- AddForeignKey
ALTER TABLE "ContractSettings" ADD CONSTRAINT "ContractSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
