-- Phase A: notification policy, scheduled delivery, and customer-facing quotations.
--
-- Every column added here is nullable or defaulted, and the one new table is
-- optional per tenant, so this migration needs no backfill and changes no
-- existing workspace's behaviour on deploy.

-- 1. Per-tenant notification policy (§6.6).
CREATE TABLE "NotificationSettings" (
    "tenantId" TEXT NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailEventTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "emailRecipientRoles" TEXT[] DEFAULT ARRAY['BUSINESS_OWNER']::TEXT[],
    "appointmentRemindersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "appointmentReminderLeadMinutes" INTEGER NOT NULL DEFAULT 1440,
    "quotationFollowUpEnabled" BOOLEAN NOT NULL DEFAULT true,
    "quotationFollowUpDays" INTEGER NOT NULL DEFAULT 3,
    "quotationAutoExpireEnabled" BOOLEAN NOT NULL DEFAULT false,
    "quotationExpiryDays" INTEGER NOT NULL DEFAULT 30,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationSettings_pkey" PRIMARY KEY ("tenantId")
);

ALTER TABLE "NotificationSettings"
    ADD CONSTRAINT "NotificationSettings_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Reminder dedup marker. NULL = not yet reminded; cleared again on reschedule.
ALTER TABLE "Appointment" ADD COLUMN "remindedAt" TIMESTAMP(3);

-- The reminder sweep scans across tenants, so it needs an index that does not
-- lead with tenantId.
CREATE INDEX "Appointment_status_scheduledAt_idx" ON "Appointment"("status", "scheduledAt");

-- 3. Customer-facing quotation link and follow-up marker.
ALTER TABLE "Quotation" ADD COLUMN "shareToken" TEXT;
ALTER TABLE "Quotation" ADD COLUMN "shareTokenIssuedAt" TIMESTAMP(3);
ALTER TABLE "Quotation" ADD COLUMN "followUpSentAt" TIMESTAMP(3);

-- Unique across the whole table: the public route has no tenant context, so the
-- token itself is the lookup key. NULLs do not collide in Postgres, so every
-- unsent quotation remains unreachable.
CREATE UNIQUE INDEX "Quotation_shareToken_key" ON "Quotation"("shareToken");

CREATE INDEX "Quotation_status_sentAt_idx" ON "Quotation"("status", "sentAt");

-- 4. A status change can now have no human author.
--
-- Widening NOT NULL to NULL is always safe for existing rows: every historical
-- change was made by a person and keeps its attribution. Only the scheduler
-- writes NULL, and only for automatic expiry.
ALTER TABLE "QuotationStatusHistory" ALTER COLUMN "changedByUserId" DROP NOT NULL;
