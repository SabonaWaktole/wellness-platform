-- Wellness Albania — Milestone 2 follow-ups (M2 Slice 11) on a live MySQL
-- database.
--
-- Turns Appointment into the one scheduled-activity entity (plan D1): a
-- follow-up is an Appointment of kind FOLLOW_UP with a type of contact, a
-- deal, a contact person, the interval it was scheduled with, the activity
-- that completed it, a cancel reason and when its due notification went out
-- (FR-FUP-01..10). Existing appointments become PLANNED meetings through the
-- column defaults; no row is rewritten. Adds the due notification and daily
-- summary switches to NotificationSettings (FR-FUP-09), and SalesSettings
-- with the days without activity after which a deal is highlighted
-- (FR-DEAL-12, default 14).
--
-- SAFE TO RUN ON PRODUCTION, AND SAFE TO RUN TWICE. `CREATE TABLE IF NOT
-- EXISTS`, information_schema guards on every column, index and foreign key.
--
-- The same statements are also carried by mysql_upgrade_to_current.sql,
-- which is the file to run when bringing a database up to date generally.
-- This one exists for applying just this change on its own.
--
-- TAKE A BACKUP FIRST:
--   mysqldump -u USER -p --single-transaction --routines DBNAME > backup.sql

SELECT 'm2 follow-ups' AS step, DATABASE() AS db, NOW() AS at;

-- Appointment becomes the one scheduled-activity entity (plan D1). Existing
-- rows become PLANNED meetings through the column defaults.
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Appointment' AND COLUMN_NAME = 'kind');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Appointment` ADD COLUMN `kind` VARCHAR(191) NOT NULL DEFAULT ''PLANNED''', 'SELECT ''skip: Appointment.kind'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Appointment' AND COLUMN_NAME = 'type');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Appointment` ADD COLUMN `type` VARCHAR(191) NOT NULL DEFAULT ''MEETING''', 'SELECT ''skip: Appointment.type'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Appointment' AND COLUMN_NAME = 'dealId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Appointment` ADD COLUMN `dealId` VARCHAR(191) NULL', 'SELECT ''skip: Appointment.dealId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Appointment' AND COLUMN_NAME = 'contactPersonId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Appointment` ADD COLUMN `contactPersonId` VARCHAR(191) NULL', 'SELECT ''skip: Appointment.contactPersonId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Appointment' AND COLUMN_NAME = 'endAt');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Appointment` ADD COLUMN `endAt` DATETIME(3) NULL', 'SELECT ''skip: Appointment.endAt'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Appointment' AND COLUMN_NAME = 'place');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Appointment` ADD COLUMN `place` TEXT NULL', 'SELECT ''skip: Appointment.place'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Appointment' AND COLUMN_NAME = 'intervalDays');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Appointment` ADD COLUMN `intervalDays` INTEGER NULL', 'SELECT ''skip: Appointment.intervalDays'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Appointment' AND COLUMN_NAME = 'completedInteractionId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Appointment` ADD COLUMN `completedInteractionId` VARCHAR(191) NULL', 'SELECT ''skip: Appointment.completedInteractionId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Appointment' AND COLUMN_NAME = 'cancelReason');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Appointment` ADD COLUMN `cancelReason` TEXT NULL', 'SELECT ''skip: Appointment.cancelReason'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Appointment' AND COLUMN_NAME = 'dueNotifiedAt');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Appointment` ADD COLUMN `dueNotifiedAt` DATETIME(3) NULL', 'SELECT ''skip: Appointment.dueNotifiedAt'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Appointment' AND INDEX_NAME = 'Appointment_completedInteractionId_key');
SET @sql := IF(@needed = 0, 'CREATE UNIQUE INDEX `Appointment_completedInteractionId_key` ON `Appointment`(`completedInteractionId`)', 'SELECT ''skip: Appointment_completedInteractionId_key'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Appointment' AND INDEX_NAME = 'Appointment_tenantId_assignedUserId_status_scheduledAt_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Appointment_tenantId_assignedUserId_status_scheduledAt_idx` ON `Appointment`(`tenantId`, `assignedUserId`, `status`, `scheduledAt`)', 'SELECT ''skip: Appointment_tenantId_assignedUserId_status_scheduledAt_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Appointment' AND INDEX_NAME = 'Appointment_tenantId_dealId_status_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Appointment_tenantId_dealId_status_idx` ON `Appointment`(`tenantId`, `dealId`, `status`)', 'SELECT ''skip: Appointment_tenantId_dealId_status_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Appointment' AND INDEX_NAME = 'Appointment_dealId_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Appointment_dealId_idx` ON `Appointment`(`dealId`)', 'SELECT ''skip: Appointment_dealId_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Appointment' AND INDEX_NAME = 'Appointment_contactPersonId_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Appointment_contactPersonId_idx` ON `Appointment`(`contactPersonId`)', 'SELECT ''skip: Appointment_contactPersonId_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- FR-FUP-09: the due notification and the daily summary.
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'NotificationSettings' AND COLUMN_NAME = 'followUpDueNotificationsEnabled');
SET @sql := IF(@needed = 0, 'ALTER TABLE `NotificationSettings` ADD COLUMN `followUpDueNotificationsEnabled` BOOLEAN NOT NULL DEFAULT true', 'SELECT ''skip: NotificationSettings.followUpDueNotificationsEnabled'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'NotificationSettings' AND COLUMN_NAME = 'followUpDailySummaryEnabled');
SET @sql := IF(@needed = 0, 'ALTER TABLE `NotificationSettings` ADD COLUMN `followUpDailySummaryEnabled` BOOLEAN NOT NULL DEFAULT false', 'SELECT ''skip: NotificationSettings.followUpDailySummaryEnabled'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'NotificationSettings' AND COLUMN_NAME = 'followUpSummarySentOn');
SET @sql := IF(@needed = 0, 'ALTER TABLE `NotificationSettings` ADD COLUMN `followUpSummarySentOn` VARCHAR(191) NULL', 'SELECT ''skip: NotificationSettings.followUpSummarySentOn'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- FR-DEAL-12: days without activity after which a deal is highlighted.
CREATE TABLE IF NOT EXISTS `SalesSettings` (
    `tenantId` VARCHAR(191) NOT NULL,
    `staleDealDays` INTEGER NOT NULL DEFAULT 14,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`tenantId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=0;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Appointment' AND CONSTRAINT_NAME = 'Appointment_dealId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Appointment` ADD CONSTRAINT `Appointment_dealId_fkey` FOREIGN KEY (`dealId`) REFERENCES `Deal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Appointment.Appointment_dealId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Appointment' AND CONSTRAINT_NAME = 'Appointment_contactPersonId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Appointment` ADD CONSTRAINT `Appointment_contactPersonId_fkey` FOREIGN KEY (`contactPersonId`) REFERENCES `ContactPerson`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Appointment.Appointment_contactPersonId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Appointment' AND CONSTRAINT_NAME = 'Appointment_completedInteractionId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Appointment` ADD CONSTRAINT `Appointment_completedInteractionId_fkey` FOREIGN KEY (`completedInteractionId`) REFERENCES `Interaction`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Appointment.Appointment_completedInteractionId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SalesSettings' AND CONSTRAINT_NAME = 'SalesSettings_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `SalesSettings` ADD CONSTRAINT `SalesSettings_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: SalesSettings.SalesSettings_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET FOREIGN_KEY_CHECKS=1;

SELECT 'm2 follow-ups done' AS step, NOW() AS at;
