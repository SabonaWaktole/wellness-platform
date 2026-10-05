-- M3 Slice 12: KPI engine and Performance screen (FR-PRF-03, FR-PRF-05; plan D13).
--
-- DealStageHistory.ownerUserId records the deal's owner when the change
-- happened, so won and lost deals are attributed to the salesperson responsible
-- at the time. Rows from before this slice take the deal's current owner.
-- Appointment.completedAt records when a follow-up was completed; completed
-- follow-ups take their last update as that time. Then the indexes the period
-- queries use.

-- AlterTable
ALTER TABLE "DealStageHistory" ADD COLUMN     "ownerUserId" TEXT;
ALTER TABLE "Appointment" ADD COLUMN     "completedAt" TIMESTAMP(3);

-- Backfill
UPDATE "DealStageHistory" AS h
   SET "ownerUserId" = d."ownerUserId"
  FROM "Deal" AS d
 WHERE h."dealId" = d."id" AND h."ownerUserId" IS NULL;

UPDATE "Appointment"
   SET "completedAt" = "updatedAt"
 WHERE "kind" = 'FOLLOW_UP' AND "status" = 'COMPLETED' AND "completedAt" IS NULL;

-- CreateIndex
CREATE INDEX "DealStageHistory_tenantId_ownerUserId_toStage_at_idx" ON "DealStageHistory"("tenantId", "ownerUserId", "toStage", "at");
CREATE INDEX "Deal_tenantId_wonAt_idx" ON "Deal"("tenantId", "wonAt");
CREATE INDEX "Deal_tenantId_lostAt_idx" ON "Deal"("tenantId", "lostAt");
CREATE INDEX "Interaction_tenantId_authorUserId_occurredAt_idx" ON "Interaction"("tenantId", "authorUserId", "occurredAt");
CREATE INDEX "Quotation_tenantId_sentAt_idx" ON "Quotation"("tenantId", "sentAt");
CREATE INDEX "Quotation_tenantId_createdByUserId_createdAt_idx" ON "Quotation"("tenantId", "createdByUserId", "createdAt");
CREATE INDEX "Appointment_tenantId_completedAt_idx" ON "Appointment"("tenantId", "completedAt");
