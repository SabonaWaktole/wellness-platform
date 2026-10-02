-- Wellness Albania — Milestone 2 deals and pipeline (M2 Slice 6) on a live
-- MySQL database.
--
-- Adds the Deal table, a company's sales opportunities with their stage,
-- and DealStageHistory, every stage change with who and when (FR-DEAL-01,
-- 06, 09). The stage keys are fixed in code, so nothing is seeded.
--
-- SAFE TO RUN ON PRODUCTION, AND SAFE TO RUN TWICE. `CREATE TABLE IF NOT
-- EXISTS` and information_schema guards on every foreign key cover the
-- re-run.
--
-- The same statements are also carried by mysql_upgrade_to_current.sql,
-- which is the file to run when bringing a database up to date generally.
-- This one exists for applying just this change on its own.
--
-- TAKE A BACKUP FIRST:
--   mysqldump -u USER -p --single-transaction --routines DBNAME > backup.sql

SELECT 'm2 deals' AS step, DATABASE() AS db, NOW() AS at;

CREATE TABLE IF NOT EXISTS `Deal` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `ownerUserId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NULL,
    `stageKey` VARCHAR(191) NOT NULL,
    `expectedCloseDate` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `createdByUserId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `closedAt` DATETIME(3) NULL,
    `deletedAt` DATETIME(3) NULL,
    `wonAt` DATETIME(3) NULL,
    `lostAt` DATETIME(3) NULL,
    `lostReasonId` VARCHAR(191) NULL,
    `lostNote` TEXT NULL,
    `agreedMonthlyPrice` DECIMAL(12, 2) NULL,
    `agreedAnnualValue` DECIMAL(12, 2) NULL,
    `packageId` VARCHAR(191) NULL,
    `wonQuotationId` VARCHAR(191) NULL,

    INDEX `Deal_tenantId_ownerUserId_stageKey_idx`(`tenantId`, `ownerUserId`, `stageKey`),
    INDEX `Deal_tenantId_clientId_idx`(`tenantId`, `clientId`),
    INDEX `Deal_tenantId_stageKey_updatedAt_idx`(`tenantId`, `stageKey`, `updatedAt`),
    INDEX `Deal_ownerUserId_idx`(`ownerUserId`),
    INDEX `Deal_createdByUserId_idx`(`createdByUserId`),
    INDEX `Deal_lostReasonId_idx`(`lostReasonId`),
    INDEX `Deal_packageId_idx`(`packageId`),
    INDEX `Deal_wonQuotationId_idx`(`wonQuotationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `DealStageHistory` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `dealId` VARCHAR(191) NOT NULL,
    `fromStage` VARCHAR(191) NULL,
    `toStage` VARCHAR(191) NOT NULL,
    `changedByUserId` VARCHAR(191) NULL,
    `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `note` TEXT NULL,

    INDEX `DealStageHistory_tenantId_dealId_at_idx`(`tenantId`, `dealId`, `at`),
    INDEX `DealStageHistory_dealId_idx`(`dealId`),
    INDEX `DealStageHistory_changedByUserId_idx`(`changedByUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=0;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Deal' AND CONSTRAINT_NAME = 'Deal_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Deal` ADD CONSTRAINT `Deal_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: Deal.Deal_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Deal' AND CONSTRAINT_NAME = 'Deal_clientId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Deal` ADD CONSTRAINT `Deal_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Deal.Deal_clientId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Deal' AND CONSTRAINT_NAME = 'Deal_ownerUserId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Deal` ADD CONSTRAINT `Deal_ownerUserId_fkey` FOREIGN KEY (`ownerUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Deal.Deal_ownerUserId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Deal' AND CONSTRAINT_NAME = 'Deal_createdByUserId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Deal` ADD CONSTRAINT `Deal_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Deal.Deal_createdByUserId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Deal' AND CONSTRAINT_NAME = 'Deal_lostReasonId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Deal` ADD CONSTRAINT `Deal_lostReasonId_fkey` FOREIGN KEY (`lostReasonId`) REFERENCES `LostReason`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Deal.Deal_lostReasonId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Deal' AND CONSTRAINT_NAME = 'Deal_packageId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Deal` ADD CONSTRAINT `Deal_packageId_fkey` FOREIGN KEY (`packageId`) REFERENCES `ServicePackage`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Deal.Deal_packageId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Deal' AND CONSTRAINT_NAME = 'Deal_wonQuotationId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Deal` ADD CONSTRAINT `Deal_wonQuotationId_fkey` FOREIGN KEY (`wonQuotationId`) REFERENCES `Quotation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Deal.Deal_wonQuotationId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DealStageHistory' AND CONSTRAINT_NAME = 'DealStageHistory_dealId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `DealStageHistory` ADD CONSTRAINT `DealStageHistory_dealId_fkey` FOREIGN KEY (`dealId`) REFERENCES `Deal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: DealStageHistory.DealStageHistory_dealId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DealStageHistory' AND CONSTRAINT_NAME = 'DealStageHistory_changedByUserId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `DealStageHistory` ADD CONSTRAINT `DealStageHistory_changedByUserId_fkey` FOREIGN KEY (`changedByUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: DealStageHistory.DealStageHistory_changedByUserId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET FOREIGN_KEY_CHECKS=1;

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20261001140000_m2_deals', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20261001140000_m2_deals'
);

SELECT 'm2 deals complete' AS step, NOW() AS at;
