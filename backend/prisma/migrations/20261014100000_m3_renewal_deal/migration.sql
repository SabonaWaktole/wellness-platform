-- M3 Slice 10: Renewal deals (FR-REN-06, 07, 10; plan D9).
--
-- A Renewal deal names the contract it renews. Nothing is backfilled: every
-- existing deal keeps NULL. A contract can have only one OPEN renewal deal at a
-- time; PostgreSQL enforces it with a partial unique index (Prisma cannot
-- declare one, so it lives in this file only). The use case also checks it
-- inside the transaction, which is what MySQL relies on.

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "renewalOfContractId" TEXT;

-- CreateIndex
CREATE INDEX "Deal_renewalOfContractId_idx" ON "Deal"("renewalOfContractId");

-- One open renewal deal per contract: not deleted, not Won, not Lost.
CREATE UNIQUE INDEX "Deal_one_open_renewal_per_contract"
  ON "Deal"("renewalOfContractId")
  WHERE "renewalOfContractId" IS NOT NULL
    AND "deletedAt" IS NULL
    AND "stageKey" NOT IN ('WON', 'LOST');

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_renewalOfContractId_fkey" FOREIGN KEY ("renewalOfContractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
