-- Wellness Albania — Milestone 3 contract settings (M3 Slice 3) on a live
-- MySQL database.
--
-- Adds the ContractSettings table: reminder lead times, the expiring-soon
-- window, payment grace days and the contract number prefix (FR-REN-01,
-- FR-REN-04, FR-PAY-09, FR-CON-05). One row per workspace, created when the
-- Administrator first saves; nothing is inserted here.
--
-- SAFE TO RUN ON PRODUCTION, AND SAFE TO RUN TWICE.
--
-- The same statements are also carried by mysql_upgrade_to_current.sql, which
-- is the file to run when bringing a database up to date generally.
--
-- TAKE A BACKUP FIRST:
--   mysqldump -u USER -p --single-transaction --routines DBNAME > backup.sql

SELECT 'm3 contract settings' AS step, DATABASE() AS db, NOW() AS at;

CREATE TABLE IF NOT EXISTS `ContractSettings` (
    `tenantId` VARCHAR(191) NOT NULL,
    `reminderLeadDays` JSON NOT NULL DEFAULT (JSON_ARRAY(60, 30, 7)),
    `expiringSoonDays` INTEGER NOT NULL DEFAULT 30,
    `paymentGraceDays` INTEGER NOT NULL DEFAULT 0,
    `numberPrefix` VARCHAR(191) NOT NULL DEFAULT 'CTR',
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedByUserId` VARCHAR(191) NULL,

    PRIMARY KEY (`tenantId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ContractSettings' AND CONSTRAINT_NAME = 'ContractSettings_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `ContractSettings` ADD CONSTRAINT `ContractSettings_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: ContractSettings.ContractSettings_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20261009100000_m3_contract_settings', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20261009100000_m3_contract_settings'
);
