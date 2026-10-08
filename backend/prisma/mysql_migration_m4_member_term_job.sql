-- Wellness Albania — Milestone 4 daily member job (M4 Slice 8) on a live MySQL
-- database.
--
-- Adds MemberTerm.expiringNotifiedAt (FR-TIR-11). No existing row is changed
-- (the column starts NULL).
--
-- SAFE TO RUN ON PRODUCTION, AND SAFE TO RUN TWICE: the column is added only if
-- missing.
--
-- The same statements are also carried by mysql_upgrade_to_current.sql, which
-- brings any older database straight to the current schema.

SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'MemberTerm' AND COLUMN_NAME = 'expiringNotifiedAt');
SET @sql := IF(@needed, 'ALTER TABLE `MemberTerm` ADD COLUMN `expiringNotifiedAt` DATETIME(3) NULL', 'SELECT ''skip: MemberTerm.expiringNotifiedAt'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20261023100000_m4_member_term_job', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20261023100000_m4_member_term_job'
);
