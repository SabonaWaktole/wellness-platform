-- Adds the ACTIVE/SUSPENDED flag that Super Admin tenant provisioning toggles.
--
-- The backfill is the DEFAULT: `NOT NULL DEFAULT 'ACTIVE'` writes ACTIVE into
-- every existing row as part of the ALTER, so no separate UPDATE is needed and
-- no tenant is ever momentarily suspended mid-migration. Every tenant that
-- exists when this runs is by definition an operating one.

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE';
