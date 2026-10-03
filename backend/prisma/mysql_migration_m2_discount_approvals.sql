-- Wellness Albania — Milestone 2 discount approvals (M2 Slice 10) on a live
-- MySQL database.
--
-- Adds DiscountApproval, the request to apply a discount above the cap
-- (FR-DSC-03..12, discount-only; manual prices are deferred), and the
-- reminder interval on NotificationSettings (FR-DSC-12, default 24 hours,
-- admin-controlled in Settings → Notifications).
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

SELECT 'm2 discount approvals' AS step, DATABASE() AS db, NOW() AS at;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'NotificationSettings' AND COLUMN_NAME = 'discountApprovalReminderHours');
SET @sql := IF(@needed = 0, 'ALTER TABLE `NotificationSettings` ADD COLUMN `discountApprovalReminderHours` INTEGER NOT NULL DEFAULT 24', 'SELECT ''skip: NotificationSettings.discountApprovalReminderHours'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `DiscountApproval` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `quotationId` VARCHAR(191) NOT NULL,
    `requestedByUserId` VARCHAR(191) NOT NULL,
    `requestedPercent` DECIMAL(7,2) NOT NULL,
    `listPriceAtRequest` DECIMAL(12,2) NOT NULL,
    `approvedPercent` DECIMAL(7,2) NULL,
    `reason` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `decidedByUserId` VARCHAR(191) NULL,
    `decidedAt` DATETIME(3) NULL,
    `comment` TEXT NULL,
    `remindedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`)
);

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DiscountApproval' AND INDEX_NAME = 'DiscountApproval_tenantId_status_createdAt_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `DiscountApproval_tenantId_status_createdAt_idx` ON `DiscountApproval`(`tenantId`, `status`, `createdAt`)', 'SELECT ''skip: DiscountApproval_tenantId_status_createdAt_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DiscountApproval' AND INDEX_NAME = 'DiscountApproval_tenantId_quotationId_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `DiscountApproval_tenantId_quotationId_idx` ON `DiscountApproval`(`tenantId`, `quotationId`)', 'SELECT ''skip: DiscountApproval_tenantId_quotationId_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DiscountApproval' AND INDEX_NAME = 'DiscountApproval_quotationId_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `DiscountApproval_quotationId_idx` ON `DiscountApproval`(`quotationId`)', 'SELECT ''skip: DiscountApproval_quotationId_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=0;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DiscountApproval' AND CONSTRAINT_NAME = 'DiscountApproval_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `DiscountApproval` ADD CONSTRAINT `DiscountApproval_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: DiscountApproval.DiscountApproval_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DiscountApproval' AND CONSTRAINT_NAME = 'DiscountApproval_quotationId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `DiscountApproval` ADD CONSTRAINT `DiscountApproval_quotationId_fkey` FOREIGN KEY (`quotationId`) REFERENCES `Quotation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: DiscountApproval.DiscountApproval_quotationId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DiscountApproval' AND CONSTRAINT_NAME = 'DiscountApproval_requestedByUserId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `DiscountApproval` ADD CONSTRAINT `DiscountApproval_requestedByUserId_fkey` FOREIGN KEY (`requestedByUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: DiscountApproval.DiscountApproval_requestedByUserId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DiscountApproval' AND CONSTRAINT_NAME = 'DiscountApproval_decidedByUserId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `DiscountApproval` ADD CONSTRAINT `DiscountApproval_decidedByUserId_fkey` FOREIGN KEY (`decidedByUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: DiscountApproval.DiscountApproval_decidedByUserId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET FOREIGN_KEY_CHECKS=1;

SELECT 'm2 discount approvals done' AS step, NOW() AS at;
