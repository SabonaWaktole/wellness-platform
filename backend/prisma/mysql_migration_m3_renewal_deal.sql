-- Wellness Albania — Milestone 3 renewal deals (M3 Slice 10) on a live MySQL
-- database.
--
-- Adds Deal.renewalOfContractId (the contract a Renewal deal renews), its index
-- and its foreign key. No row is changed. MySQL has no partial unique index, so
-- "one open renewal deal per contract" is checked by the use case inside the
-- transaction, under a lock on the contract row.
--
-- SAFE TO RUN ON PRODUCTION, AND SAFE TO RUN TWICE: every statement is guarded
-- by information_schema. The same statements are also carried by
-- mysql_upgrade_to_current.sql.
--
-- TAKE A BACKUP FIRST:
--   mysqldump -u USER -p --single-transaction --routines DBNAME > backup.sql

SELECT 'm3 renewal deal' AS step, DATABASE() AS db, NOW() AS at;

SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Deal' AND COLUMN_NAME = 'renewalOfContractId');
SET @sql := IF(@needed, 'ALTER TABLE `Deal` ADD COLUMN `renewalOfContractId` VARCHAR(191) NULL', 'SELECT ''skip: Deal.renewalOfContractId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Deal' AND INDEX_NAME = 'Deal_renewalOfContractId_idx');
SET @sql := IF(@needed, 'CREATE INDEX `Deal_renewalOfContractId_idx` ON `Deal`(`renewalOfContractId`)', 'SELECT ''skip: Deal_renewalOfContractId_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Deal' AND CONSTRAINT_NAME = 'Deal_renewalOfContractId_fkey');
SET @sql := IF(@needed, 'ALTER TABLE `Deal` ADD CONSTRAINT `Deal_renewalOfContractId_fkey` FOREIGN KEY (`renewalOfContractId`) REFERENCES `Contract`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Deal_renewalOfContractId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20261014100000_m3_renewal_deal', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20261014100000_m3_renewal_deal'
);
