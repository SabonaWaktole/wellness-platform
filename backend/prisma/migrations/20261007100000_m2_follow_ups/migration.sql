-- M2 Slice 11: follow-ups (FR-FUP-01..10, FR-DEAL-12; plan D1).
-- A follow-up is an Appointment of kind FOLLOW_UP, so the calendar (Slice 12)
-- reads one table. Existing appointments become PLANNED meetings through the
-- column defaults; no row is rewritten. Overdue is derived (open and due
-- before now), never stored. NotificationSettings gains the due notification
-- and the daily summary switches (FR-FUP-09), and SalesSettings holds the
-- number of days without activity after which a deal is highlighted
-- (FR-DEAL-12, default 14).

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "completedInteractionId" TEXT,
ADD COLUMN     "contactPersonId" TEXT,
ADD COLUMN     "dealId" TEXT,
ADD COLUMN     "dueNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "endAt" TIMESTAMP(3),
ADD COLUMN     "intervalDays" INTEGER,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'PLANNED',
ADD COLUMN     "place" TEXT,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'MEETING';

-- AlterTable
ALTER TABLE "NotificationSettings" ADD COLUMN     "followUpDailySummaryEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "followUpDueNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "followUpSummarySentOn" TEXT;

-- CreateTable
CREATE TABLE "SalesSettings" (
    "tenantId" TEXT NOT NULL,
    "staleDealDays" INTEGER NOT NULL DEFAULT 14,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesSettings_pkey" PRIMARY KEY ("tenantId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_completedInteractionId_key" ON "Appointment"("completedInteractionId");

-- CreateIndex
CREATE INDEX "Appointment_tenantId_assignedUserId_status_scheduledAt_idx" ON "Appointment"("tenantId", "assignedUserId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "Appointment_tenantId_dealId_status_idx" ON "Appointment"("tenantId", "dealId", "status");

-- CreateIndex
CREATE INDEX "Appointment_dealId_idx" ON "Appointment"("dealId");

-- CreateIndex
CREATE INDEX "Appointment_contactPersonId_idx" ON "Appointment"("contactPersonId");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_contactPersonId_fkey" FOREIGN KEY ("contactPersonId") REFERENCES "ContactPerson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_completedInteractionId_fkey" FOREIGN KEY ("completedInteractionId") REFERENCES "Interaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesSettings" ADD CONSTRAINT "SalesSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

