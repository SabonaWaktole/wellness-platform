-- Wellness Albania — Milestone 3 signed contract document versions (M3 Slice 5,
-- FR-CON-19) on a live MySQL database.
--
-- Adds ContractDocument, one row per file ever attached to a contract with
-- exactly the newest current, and copies each existing Contract.documentUrl
-- into one current row (attributed to the contract's creator, dated at its
-- last update).
--
-- SAFE TO RUN ON PRODUCTION, AND SAFE TO RUN TWICE. The table, indexes and
-- foreign keys are guarded by information_schema, and the copy only inserts
-- for a contract that has no document row yet.
--
-- The same statements are also carried by mysql_upgrade_to_current.sql.
--
-- TAKE A BACKUP FIRST:
--   mysqldump -u USER -p --single-transaction --routines DBNAME > backup.sql

SELECT 'm3 contract documents' AS step, DATABASE() AS db, NOW() AS at;

CREATE TABLE IF NOT EXISTS `ContractDocument` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `contractId` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `uploadedByUserId` VARCHAR(191) NOT NULL,
    `uploadedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `isCurrent` BOOLEAN NOT NULL DEFAULT true,

    INDEX `ContractDocument_contractId_isCurrent_idx`(`contractId`, `isCurrent`),
    INDEX `ContractDocument_tenantId_contractId_idx`(`tenantId`, `contractId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ContractDocument.ContractDocument_contractId_fkey
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ContractDocument' AND CONSTRAINT_NAME = 'ContractDocument_contractId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `ContractDocument` ADD CONSTRAINT `ContractDocument_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `Contract`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: ContractDocument.ContractDocument_contractId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ContractDocument.ContractDocument_uploadedByUserId_fkey
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ContractDocument' AND CONSTRAINT_NAME = 'ContractDocument_uploadedByUserId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `ContractDocument` ADD CONSTRAINT `ContractDocument_uploadedByUserId_fkey` FOREIGN KEY (`uploadedByUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: ContractDocument.ContractDocument_uploadedByUserId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Copy each existing document into one current row (once).
INSERT INTO `ContractDocument` (`id`, `tenantId`, `contractId`, `fileName`, `url`, `uploadedByUserId`, `uploadedAt`, `isCurrent`)
SELECT UUID(), c.`tenantId`, c.`id`, COALESCE(c.`documentName`, 'contract.pdf'), c.`documentUrl`, c.`createdByUserId`, c.`updatedAt`, true
FROM `Contract` c
WHERE c.`documentUrl` IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `ContractDocument` d WHERE d.`contractId` = c.`id`);

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20261011100000_m3_contract_documents', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20261011100000_m3_contract_documents'
);
