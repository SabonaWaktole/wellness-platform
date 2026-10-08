-- M4 Slice 13: Reception and partner-clinic verification (FR-VER-03, FR-VER-06, FR-VER-10).
-- Adds VerificationEvent, one row per check of a card. The table starts empty on every
-- workspace: no existing row is read or changed (NFR-OPS-04). A public scan keeps only a
-- keyed hash of the caller's address.

-- CreateTable
CREATE TABLE "VerificationEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT,
    "channel" TEXT NOT NULL,
    "userId" TEXT,
    "result" TEXT NOT NULL,
    "identityChoice" TEXT NOT NULL DEFAULT 'NONE',
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VerificationEvent_tenantId_memberId_createdAt_idx" ON "VerificationEvent"("tenantId", "memberId", "createdAt");

-- AddForeignKey
ALTER TABLE "VerificationEvent" ADD CONSTRAINT "VerificationEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationEvent" ADD CONSTRAINT "VerificationEvent_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
