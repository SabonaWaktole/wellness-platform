-- M3 Slice 4: contracts from won deals (FR-CON-01..10, NFR-DAT-01, NFR-ACC-03,
-- NFR-OPS-03; plan D1, D2, D3).
--
-- 1. Float -> Decimal(12,2) for Contract.amount and ContractPayment.amount and
--    paidAmount, rounded half-up (ROUND on numeric). Before anything changes,
--    the migration refuses to continue if a stored amount would move by half a
--    cent or more, unless the database setting m3.rounding_reviewed is 'on'
--    (set it after reading the listed rows: ALTER DATABASE ... SET
--    m3.rounding_reviewed = 'on'). Float amounts that already have two decimals
--    do not move at all.
-- 2. ContractPayment.status defaults to NOT_INVOICED. No existing row changes
--    status.
-- 3. The contract's deal, offer, package, services, terms, annual value,
--    discount, number, renewal date and the lifecycle columns Slice 5 writes.
--    Existing contracts get dealId NULL (Legacy: no deal); nothing is invented
--    for them. Contract numbers are not backfilled (D3).
--
-- TAKE A BACKUP FIRST (pg_dump); to reverse, restore it: the Float values
-- cannot be recovered from the rounded Decimal.

DO $$
DECLARE
  moved text;
BEGIN
  SELECT string_agg(found.label, '; ') INTO moved FROM (
    SELECT 'Contract ' || "id" || ' amount ' || "amount" AS label FROM "Contract"
      WHERE ABS("amount"::numeric - ROUND("amount"::numeric, 2)) >= 0.005
    UNION ALL
    SELECT 'ContractPayment ' || "id" || ' amount ' || "amount" FROM "ContractPayment"
      WHERE ABS("amount"::numeric - ROUND("amount"::numeric, 2)) >= 0.005
    UNION ALL
    SELECT 'ContractPayment ' || "id" || ' paidAmount ' || "paidAmount" FROM "ContractPayment"
      WHERE ABS("paidAmount"::numeric - ROUND("paidAmount"::numeric, 2)) >= 0.005
    LIMIT 50
  ) AS found;

  IF moved IS NOT NULL AND COALESCE(current_setting('m3.rounding_reviewed', true), '') <> 'on' THEN
    RAISE EXCEPTION 'M3 Slice 4: these amounts would change by half a cent or more when rounded to two decimals: %. Review them, then SET m3.rounding_reviewed = ''on'' on the database and run the migration again.', moved;
  END IF;
END $$;

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "agreedAnnualValue" DECIMAL(12,2),
ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "dealId" TEXT,
ADD COLUMN     "discountPercent" DECIMAL(7,2),
ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "notRenewingNote" TEXT,
ADD COLUMN     "notRenewingReasonId" TEXT,
ADD COLUMN     "number" TEXT,
ADD COLUMN     "packageId" TEXT,
ADD COLUMN     "quotationId" TEXT,
ADD COLUMN     "renewalDate" DATE,
ADD COLUMN     "servicesSnapshot" JSONB,
ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspensionReason" TEXT,
ADD COLUMN     "termsText" JSONB,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2) USING ROUND("amount"::numeric, 2);

-- AlterTable
ALTER TABLE "ContractPayment" ADD COLUMN     "invoiceDate" DATE,
ADD COLUMN     "invoiceNumber" TEXT,
ADD COLUMN     "overdueNotifiedAt" TIMESTAMP(3),
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2) USING ROUND("amount"::numeric, 2),
ALTER COLUMN "status" SET DEFAULT 'NOT_INVOICED',
ALTER COLUMN "paidAmount" SET DATA TYPE DECIMAL(12,2) USING ROUND("paidAmount"::numeric, 2);

-- CreateIndex
CREATE UNIQUE INDEX "Contract_dealId_key" ON "Contract"("dealId");

-- CreateIndex
CREATE INDEX "Contract_quotationId_idx" ON "Contract"("quotationId");

-- CreateIndex
CREATE INDEX "Contract_packageId_idx" ON "Contract"("packageId");

-- CreateIndex
CREATE INDEX "Contract_notRenewingReasonId_idx" ON "Contract"("notRenewingReasonId");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_tenantId_number_key" ON "Contract"("tenantId", "number");

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "ServicePackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_notRenewingReasonId_fkey" FOREIGN KEY ("notRenewingReasonId") REFERENCES "LostReason"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

