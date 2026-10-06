-- M3 Slice 8: instalment history (FR-PAY-08, plan D6).
--
-- One row per change to an instalment. Every receipt is one row, so this is
-- also the receipt list; a reversal is a row with a negative amount. The user
-- is RESTRICT, as in ContractStatusHistory; NULL is the system.

-- CreateTable
CREATE TABLE "ContractPaymentHistory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "amountReceived" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "receivedOn" DATE,
    "method" TEXT,
    "changedByUserId" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractPaymentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContractPaymentHistory_paymentId_createdAt_idx" ON "ContractPaymentHistory"("paymentId", "createdAt");

-- AddForeignKey
ALTER TABLE "ContractPaymentHistory" ADD CONSTRAINT "ContractPaymentHistory_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "ContractPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractPaymentHistory" ADD CONSTRAINT "ContractPaymentHistory_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
