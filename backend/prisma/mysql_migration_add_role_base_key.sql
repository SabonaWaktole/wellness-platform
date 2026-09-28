-- Wellness Albania — custom roles remember the system role they were copied
-- from (Slice 6: FR-RBAC-04).
--
-- SAFE TO RUN ON PRODUCTION, AND SAFE TO RUN TWICE. The ALTER TABLE is guarded
-- with information_schema. The new column is NULL for every existing role,
-- which is correct: only the five system roles exist before this slice.
--
-- The same statements are also carried by mysql_upgrade_to_current.sql.
--
-- TAKE A BACKUP FIRST:
--   mysqldump -u USER -p --single-transaction --routines DBNAME > backup.sql

SELECT 'adding Role.baseKey' AS step, DATABASE() AS db, NOW() AS at;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Role' AND COLUMN_NAME = 'baseKey');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Role` ADD COLUMN `baseKey` VARCHAR(191) NULL', 'SELECT ''skip: Role.baseKey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20260928120000_add_role_base_key', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20260928120000_add_role_base_key'
);

SELECT 'Role.baseKey' AS item, IF(COUNT(*) > 0, 'OK', 'STILL MISSING') AS state FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Role' AND COLUMN_NAME='baseKey';
