-- Wellness Albania — the SRS payment status keys and the StatusLabel table on
-- a live MySQL database (Slice 10: FR-SET-07, 08, developer note in SRS
-- §5.2, decision D6).
--
-- SAFE TO RUN ON PRODUCTION, AND SAFE TO RUN TWICE. Every `ContractPayment`
-- row is remapped from its old key exactly once: once `UNPAID` rows are gone,
-- the UPDATE matches nothing on a second run. `CREATE TABLE IF NOT EXISTS`
-- and the information_schema guard on the foreign key cover the rest.
--
-- The same statements are also carried by mysql_upgrade_to_current.sql, which
-- is the file to run when bringing a database up to date generally. This one
-- exists for applying just this change on its own.
--
-- TAKE A BACKUP FIRST:
--   mysqldump -u USER -p --single-transaction --routines DBNAME > backup.sql

SELECT 'adding StatusLabel and remapping ContractPayment.status' AS step, DATABASE() AS db, NOW() AS at;

-- Existing ContractPayment rows are remapped so no row is left on a key the
-- product no longer offers: UNPAID -> PAYMENT_PENDING, PARTIAL ->
-- PARTIALLY_PAID, PAID stays PAID. WAIVED is untouched: it has no SRS
-- equivalent (D6) and stays a hidden legacy key on the rows that already
-- have it.
UPDATE `ContractPayment` SET `status` = 'PAYMENT_PENDING' WHERE `status` = 'UNPAID';
UPDATE `ContractPayment` SET `status` = 'PARTIALLY_PAID' WHERE `status` = 'PARTIAL';
ALTER TABLE `ContractPayment` ALTER COLUMN `status` SET DEFAULT 'PAYMENT_PENDING';

CREATE TABLE IF NOT EXISTS `StatusLabel` (
    `tenantId` VARCHAR(191) NOT NULL,
    `domain` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `labelSq` VARCHAR(191) NOT NULL,
    `labelEn` VARCHAR(191) NULL,
    `colour` VARCHAR(191) NOT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`tenantId`, `domain`, `key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=0;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'StatusLabel' AND CONSTRAINT_NAME = 'StatusLabel_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `StatusLabel` ADD CONSTRAINT `StatusLabel_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: StatusLabel.StatusLabel_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET FOREIGN_KEY_CHECKS=1;

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20260928174225_status_keys_and_labels', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20260928174225_status_keys_and_labels'
);

SELECT item, IF(present > 0, 'OK', 'STILL MISSING') AS state FROM (
  SELECT 'StatusLabel table' AS item, COUNT(*) AS present FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='StatusLabel'
  UNION ALL SELECT 'ContractPayment rows still on a legacy key', COUNT(*) FROM `ContractPayment`
   WHERE `status` IN ('UNPAID', 'PARTIAL')
) AS checks;

SELECT 'StatusLabel and ContractPayment.status ready' AS step, NOW() AS at;
