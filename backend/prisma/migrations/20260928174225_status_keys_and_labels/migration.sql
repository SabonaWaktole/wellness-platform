-- Slice 10 (FR-SET-07, 08; developer note in SRS §5.2, decision D6): the SRS
-- payment status keys, and per-workspace status labels/colours/order.
-- Existing ContractPayment rows are remapped so no row is left on a key the
-- product no longer offers: UNPAID -> PAYMENT_PENDING, PARTIAL ->
-- PARTIALLY_PAID, PAID stays PAID. WAIVED is untouched: it has no SRS
-- equivalent (D6) and stays a hidden legacy key on the rows that already
-- have it.
UPDATE "ContractPayment" SET "status" = 'PAYMENT_PENDING' WHERE "status" = 'UNPAID';
UPDATE "ContractPayment" SET "status" = 'PARTIALLY_PAID' WHERE "status" = 'PARTIAL';

-- AlterTable
ALTER TABLE "ContractPayment" ALTER COLUMN "status" SET DEFAULT 'PAYMENT_PENDING';

-- CreateTable
CREATE TABLE "StatusLabel" (
    "tenantId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "labelSq" TEXT NOT NULL,
    "labelEn" TEXT,
    "colour" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StatusLabel_pkey" PRIMARY KEY ("tenantId","domain","key")
);

-- AddForeignKey
ALTER TABLE "StatusLabel" ADD CONSTRAINT "StatusLabel_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
