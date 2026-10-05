-- Wellness Albania — Milestone 3 payment received-date index (M3 Slice 9)
-- on a live MySQL database.
--
-- Adds ContractPayment (tenantId, paidAt), used by the revenue figure of the
-- KPI engine and the dashboards. No row is changed.
--
-- SAFE TO RUN ON PRODUCTION, AND SAFE TO RUN TWICE: the index is guarded by
-- information_schema. The same statement is also carried by
-- mysql_upgrade_to_current.sql.
--
-- TAKE A BACKUP FIRST:
--   mysqldump -u USER -p --single-transaction --routines DBNAME > backup.sql

SELECT 'm3 payment paid-at index' AS step, DATABASE() AS db, NOW() AS at;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ContractPayment' AND INDEX_NAME = 'ContractPayment_tenantId_paidAt_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `ContractPayment_tenantId_paidAt_idx` ON `ContractPayment`(`tenantId`, `paidAt`)', 'SELECT ''skip: ContractPayment_tenantId_paidAt_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20261013100000_m3_payment_paid_at_index', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20261013100000_m3_payment_paid_at_index'
);
