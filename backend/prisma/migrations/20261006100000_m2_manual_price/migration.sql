-- M2 Slice 10: manual price for "Price on request" (FR-PRC-09).
-- A DiscountApproval now has a kind: DISCOUNT (above the cap) or
-- MANUAL_PRICE. A manual-price request carries a monthly price instead of a
-- percent and a list price, so those two become nullable. The offer keeps
-- the manual price and its reason next to its amounts.

-- AlterTable
ALTER TABLE "DiscountApproval" ADD COLUMN     "approvedMonthlyPrice" DECIMAL(12,2),
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'DISCOUNT',
ADD COLUMN     "requestedMonthlyPrice" DECIMAL(12,2),
ALTER COLUMN "requestedPercent" DROP NOT NULL,
ALTER COLUMN "listPriceAtRequest" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "manualMonthlyPrice" DECIMAL(12,2),
ADD COLUMN     "manualPriceReason" TEXT;

