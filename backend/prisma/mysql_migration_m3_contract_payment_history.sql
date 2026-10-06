-- Wellness Albania — Milestone 3 instalment history (M3 Slice 8, FR-PAY-08)
-- on a live MySQL database.
--
-- Adds ContractPaymentHistory: one row per change to an instalment, every
-- receipt one row (a reversal is negative). No existing row is changed.
--
-- SAFE TO RUN ON PRODUCTION, AND SAFE TO RUN TWICE. The table, index and
-- foreign keys are guarded by information_schema.
--
-- The same statements are also carried by mysql_upgrade_to_current.sql.
--
-- TAKE A BACKUP FIRST:
--   mysqldump -u USER -p --single-transaction --routines DBNAME > backup.sql

SELECT 'm3 contract payment history' AS step, DATABASE() AS db, NOW() AS at;

CREATE TABLE IF NOT EXISTS `ContractPaymentHistory` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `paymentId` VARCHAR(191) NOT NULL,
    `fromStatus` VARCHAR(191) NOT NULL,
    `toStatus` VARCHAR(191) NOT NULL,
    `amountReceived` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `receivedOn` DATE NULL,
    `method` VARCHAR(191) NULL,
    `changedByUserId` VARCHAR(191) NULL,
    `comment` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ContractPaymentHistory_paymentId_createdAt_idx`(`paymentId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ContractPaymentHistory.ContractPaymentHistory_paymentId_fkey
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ContractPaymentHistory' AND CONSTRAINT_NAME = 'ContractPaymentHistory_paymentId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `ContractPaymentHistory` ADD CONSTRAINT `ContractPaymentHistory_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `ContractPayment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: ContractPaymentHistory.ContractPaymentHistory_paymentId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ContractPaymentHistory.ContractPaymentHistory_changedByUserId_fkey
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ContractPaymentHistory' AND CONSTRAINT_NAME = 'ContractPaymentHistory_changedByUserId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `ContractPaymentHistory` ADD CONSTRAINT `ContractPaymentHistory_changedByUserId_fkey` FOREIGN KEY (`changedByUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: ContractPaymentHistory.ContractPaymentHistory_changedByUserId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20261012100000_m3_contract_payment_history', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20261012100000_m3_contract_payment_history'
);
