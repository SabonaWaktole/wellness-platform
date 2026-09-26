-- NevaCRM — add the contracts module to a live MySQL database.
--
-- SAFE TO RUN ON PRODUCTION, AND SAFE TO RUN TWICE. Everything here is
-- additive: three new tables and their foreign keys. No existing table,
-- column, index or row is touched, so there is nothing for this to lose.
--
-- `CREATE TABLE IF NOT EXISTS` covers re-runs of the tables. The foreign keys
-- are guarded against information_schema instead, because MySQL has no
-- `ADD CONSTRAINT IF NOT EXISTS` — a second run would otherwise fail on
-- "Duplicate foreign key constraint name". The guard is spelled as
-- SET/PREPARE/EXECUTE rather than as a stored procedure to match
-- mysql_upgrade_to_current.sql, and because DELIMITER is a client directive
-- that phpMyAdmin and several hosting consoles do not accept.
--
-- The same statements are also carried by mysql_upgrade_to_current.sql, which
-- is the file to run when bringing a database up to date generally. This one
-- exists for applying just the contracts module on its own.
--
-- TAKE A BACKUP FIRST:
--   mysqldump -u USER -p --single-transaction --routines DBNAME > backup.sql

SELECT 'adding contracts module' AS step, DATABASE() AS db, NOW() AS at;

SET FOREIGN_KEY_CHECKS=0;

-- ---------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `Contract` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `assignedUserId` VARCHAR(191) NULL,
    `planName` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `billingPeriod` VARCHAR(191) NOT NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NOT NULL,
    `notes` TEXT NULL,
    `documentUrl` TEXT NULL,
    `documentName` TEXT NULL,
    `renewedFromContractId` VARCHAR(191) NULL,
    `activatedAt` DATETIME(3) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `expiryNotifiedAt` DATETIME(3) NULL,
    `createdByUserId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Contract_renewedFromContractId_key`(`renewedFromContractId`),
    INDEX `Contract_tenantId_clientId_idx`(`tenantId`, `clientId`),
    INDEX `Contract_tenantId_status_idx`(`tenantId`, `status`),
    INDEX `Contract_tenantId_assignedUserId_idx`(`tenantId`, `assignedUserId`),
    INDEX `Contract_status_endsAt_idx`(`status`, `endsAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ContractPayment` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `contractId` VARCHAR(191) NOT NULL,
    `periodIndex` INTEGER NOT NULL,
    `dueDate` DATETIME(3) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'UNPAID',
    `paidAmount` DOUBLE NOT NULL DEFAULT 0,
    `paidAt` DATETIME(3) NULL,
    `method` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ContractPayment_tenantId_contractId_dueDate_idx`(`tenantId`, `contractId`, `dueDate`),
    INDEX `ContractPayment_tenantId_status_dueDate_idx`(`tenantId`, `status`, `dueDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ContractStatusHistory` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `contractId` VARCHAR(191) NOT NULL,
    `fromStatus` VARCHAR(191) NOT NULL,
    `toStatus` VARCHAR(191) NOT NULL,
    `changedByUserId` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ContractStatusHistory_tenantId_contractId_idx`(`tenantId`, `contractId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- Foreign keys, each added only if it is not already there.
-- ---------------------------------------------------------------

-- Contract.Contract_tenantId_fkey
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND CONSTRAINT_NAME = 'Contract_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD CONSTRAINT `Contract_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Contract.Contract_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Contract.Contract_clientId_fkey
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND CONSTRAINT_NAME = 'Contract_clientId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD CONSTRAINT `Contract_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Contract.Contract_clientId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Contract.Contract_assignedUserId_fkey
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND CONSTRAINT_NAME = 'Contract_assignedUserId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD CONSTRAINT `Contract_assignedUserId_fkey` FOREIGN KEY (`assignedUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Contract.Contract_assignedUserId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Contract.Contract_createdByUserId_fkey
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND CONSTRAINT_NAME = 'Contract_createdByUserId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD CONSTRAINT `Contract_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Contract.Contract_createdByUserId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Contract.Contract_renewedFromContractId_fkey
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND CONSTRAINT_NAME = 'Contract_renewedFromContractId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD CONSTRAINT `Contract_renewedFromContractId_fkey` FOREIGN KEY (`renewedFromContractId`) REFERENCES `Contract`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Contract.Contract_renewedFromContractId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ContractPayment.ContractPayment_contractId_fkey
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ContractPayment' AND CONSTRAINT_NAME = 'ContractPayment_contractId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `ContractPayment` ADD CONSTRAINT `ContractPayment_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `Contract`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: ContractPayment.ContractPayment_contractId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ContractStatusHistory.ContractStatusHistory_contractId_fkey
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ContractStatusHistory' AND CONSTRAINT_NAME = 'ContractStatusHistory_contractId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `ContractStatusHistory` ADD CONSTRAINT `ContractStatusHistory_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `Contract`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: ContractStatusHistory.ContractStatusHistory_contractId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ContractStatusHistory.ContractStatusHistory_changedByUserId_fkey
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ContractStatusHistory' AND CONSTRAINT_NAME = 'ContractStatusHistory_changedByUserId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `ContractStatusHistory` ADD CONSTRAINT `ContractStatusHistory_changedByUserId_fkey` FOREIGN KEY (`changedByUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: ContractStatusHistory.ContractStatusHistory_changedByUserId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=1;

-- ---------------------------------------------------------------
-- Migration-history bookkeeping, so a later `prisma migrate deploy`
-- recognises this work as already applied rather than trying to redo it.
-- ---------------------------------------------------------------
INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20260914173610_add_contracts', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20260914173610_add_contracts'
);

-- ---------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------
SELECT item, IF(present > 0, 'OK', 'STILL MISSING') AS state FROM (
  SELECT 'Contract table' AS item, COUNT(*) AS present FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Contract'
  UNION ALL SELECT 'ContractPayment table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ContractPayment'
  UNION ALL SELECT 'ContractStatusHistory table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ContractStatusHistory'
  UNION ALL SELECT 'Contract foreign keys', COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='Contract' AND CONSTRAINT_TYPE='FOREIGN KEY'
) AS checks;

SELECT 'contracts module ready' AS step, NOW() AS at;
