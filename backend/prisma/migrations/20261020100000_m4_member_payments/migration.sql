-- M4 Slice 5: Wellness+ membership payments (FR-MPAY-01..11, NFR-ACC-05,
-- NFR-DAT-02). Adds MemberPayment. The table starts empty on every workspace:
-- no existing row is read or changed (NFR-OPS-04).

-- CreateTable
CREATE TABLE "MemberPayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fromTier" TEXT NOT NULL,
    "toTier" TEXT NOT NULL,
    "listFee" DECIMAL(12,2) NOT NULL,
    "discountPercent" DECIMAL(7,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" TEXT NOT NULL,
    "receivedOn" DATE NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "note" TEXT,
    "recordedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidedBy" TEXT,
    "voidReason" TEXT,

    CONSTRAINT "MemberPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemberPayment_tenantId_receiptNumber_key" ON "MemberPayment"("tenantId", "receiptNumber");

-- CreateIndex
CREATE INDEX "MemberPayment_tenantId_receivedOn_idx" ON "MemberPayment"("tenantId", "receivedOn");

-- CreateIndex
CREATE INDEX "MemberPayment_memberId_createdAt_idx" ON "MemberPayment"("memberId", "createdAt");

-- AddForeignKey
ALTER TABLE "MemberPayment" ADD CONSTRAINT "MemberPayment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
