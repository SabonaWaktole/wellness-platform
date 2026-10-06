-- Wellness Albania — Milestone 3 renewal reminders (M3 Slice 11) on a live
-- MySQL database.
--
-- Adds the ContractReminder table (one row per contract and lead time, SENT or
-- SKIPPED; FR-REN-01, FR-REN-03) and drops Contract.expiryNotifiedAt. Contracts
-- that were already warned get a SENT row at the 30-day lead time first, so
-- nothing is reminded twice after the upgrade (NFR-OPS-03).
--
-- SAFE TO RUN ON PRODUCTION, AND SAFE TO RUN TWICE: every statement is guarded
-- by information_schema, and the copy only runs while the old column exists.
-- The same statements are also carried by mysql_upgrade_to_current.sql.
--
-- TAKE A BACKUP FIRST:
--   mysqldump -u USER -p --single-transaction --routines DBNAME > backup.sql

SELECT 'm3 contract reminders' AS step, DATABASE() AS db, NOW() AS at;

CREATE TABLE IF NOT EXISTS `ContractReminder` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `contractId` VARCHAR(191) NOT NULL,
    `leadDays` INTEGER NOT NULL,
    `state` VARCHAR(191) NOT NULL,
    `sentAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ContractReminder_contractId_leadDays_key`(`contractId`, `leadDays`),
    INDEX `ContractReminder_tenantId_contractId_idx`(`tenantId`, `contractId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ContractReminder' AND CONSTRAINT_NAME = 'ContractReminder_contractId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed, 'ALTER TABLE `ContractReminder` ADD CONSTRAINT `ContractReminder_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `Contract`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: ContractReminder_contractId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_old := (SELECT COUNT(*) > 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND COLUMN_NAME = 'expiryNotifiedAt');

SET @sql := IF(@has_old,
  'INSERT IGNORE INTO `ContractReminder` (`id`, `tenantId`, `contractId`, `leadDays`, `state`, `sentAt`) SELECT UUID(), `tenantId`, `id`, 30, ''SENT'', `expiryNotifiedAt` FROM `Contract` WHERE `expiryNotifiedAt` IS NOT NULL',
  'SELECT ''skip: copy of Contract.expiryNotifiedAt'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(@has_old, 'ALTER TABLE `Contract` DROP COLUMN `expiryNotifiedAt`', 'SELECT ''skip: Contract.expiryNotifiedAt already dropped'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20261015100000_m3_contract_reminders', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20261015100000_m3_contract_reminders'
);
