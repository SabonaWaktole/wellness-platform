-- M4 Slice 7: Wellness+ VIP requests and approval (FR-VIP-01..05, NFR-DAT-02).
-- Adds VipRequest. The table starts empty on every workspace: no existing row is
-- read or changed (NFR-OPS-04). A member can have only one PENDING request;
-- PostgreSQL enforces it with the partial unique index below (Prisma cannot
-- declare one, so it lives in this file only). The use case also checks it
-- inside the transaction, which is what MySQL relies on.

-- CreateTable
CREATE TABLE "VipRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "reviewNotifiedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "endedBy" TEXT,
    "endReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VipRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VipRequest_tenantId_status_createdAt_idx" ON "VipRequest"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "VipRequest_memberId_createdAt_idx" ON "VipRequest"("memberId", "createdAt");

-- One open request per member (NFR-DAT-02).
CREATE UNIQUE INDEX "VipRequest_one_pending_per_member" ON "VipRequest"("memberId") WHERE "status" = 'PENDING';

-- AddForeignKey
ALTER TABLE "VipRequest" ADD CONSTRAINT "VipRequest_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
