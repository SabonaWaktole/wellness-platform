-- M3 Slice 11: renewal reminders recorded per contract and lead time (FR-REN-01,
-- FR-REN-03; plan D8).
--
-- Replaces Contract.expiryNotifiedAt. A contract that was already warned keeps
-- that fact as a SENT row at the 30-day lead time, so nothing is reminded twice
-- after the upgrade (NFR-OPS-03). The column is dropped after the copy.

-- CreateTable
CREATE TABLE "ContractReminder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "leadDays" INTEGER NOT NULL,
    "state" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContractReminder_contractId_leadDays_key" ON "ContractReminder"("contractId", "leadDays");

-- CreateIndex
CREATE INDEX "ContractReminder_tenantId_contractId_idx" ON "ContractReminder"("tenantId", "contractId");

-- AddForeignKey
ALTER TABLE "ContractReminder" ADD CONSTRAINT "ContractReminder_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep what the old column said: warned contracts have had their 30-day notice.
INSERT INTO "ContractReminder" ("id", "tenantId", "contractId", "leadDays", "state", "sentAt")
SELECT md5(random()::text || "id"), "tenantId", "id", 30, 'SENT', "expiryNotifiedAt"
FROM "Contract"
WHERE "expiryNotifiedAt" IS NOT NULL;

-- AlterTable
ALTER TABLE "Contract" DROP COLUMN "expiryNotifiedAt";
