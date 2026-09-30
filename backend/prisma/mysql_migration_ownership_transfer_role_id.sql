-- Wellness Albania — ownership handovers move the permission role (Slice 15
-- security review) on a live MySQL database.
--
-- Adds OwnershipTransfer.previousActingRoleId, and repairs users whose
-- User.role and User.roleId the old handover code left disagreeing: a demoted
-- owner who kept Administrator rights, or a promoted stand-in who never got
-- them.
--
-- SAFE TO RUN ON PRODUCTION, AND SAFE TO RUN TWICE. The column add is guarded
-- against information_schema and the repairs match nothing once applied.
--
-- The same statements are also carried by mysql_upgrade_to_current.sql, which
-- is the file to run when bringing a database up to date generally. This one
-- exists for applying just this change on its own.
--
-- TAKE A BACKUP FIRST:
--   mysqldump -u USER -p --single-transaction --routines DBNAME > backup.sql

SELECT 'ownership transfer roles' AS step, DATABASE() AS db, NOW() AS at;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'OwnershipTransfer' AND COLUMN_NAME = 'previousActingRoleId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `OwnershipTransfer` ADD COLUMN `previousActingRoleId` VARCHAR(191) NULL', 'SELECT ''skip: OwnershipTransfer.previousActingRoleId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Repair users the old handover code left inconsistent. The legacy mirror is
-- BUSINESS_OWNER exactly when the role is (or was copied from) Administrator.
-- Both updates match nothing on a consistent database, so a re-run is a no-op.
-- 1. An owner demoted by "keep current ownership" kept the Administrator role.
UPDATE `User` u
JOIN `Role` adm ON adm.`tenantId` = u.`tenantId` AND adm.`key` = 'ADMINISTRATOR' AND adm.`isSystem` = 1
JOIN `Role` sales ON sales.`tenantId` = u.`tenantId` AND sales.`key` = 'SALES_USER' AND sales.`isSystem` = 1
SET u.`roleId` = sales.`id`
WHERE u.`role` = 'STAFF' AND u.`roleId` = adm.`id`;

-- 2. A stand-in promoted to BUSINESS_OWNER kept their old, non-Administrator role.
UPDATE `User` u
JOIN `Role` cur ON cur.`id` = u.`roleId`
JOIN `Role` adm ON adm.`tenantId` = u.`tenantId` AND adm.`key` = 'ADMINISTRATOR' AND adm.`isSystem` = 1
SET u.`roleId` = adm.`id`
WHERE u.`role` = 'BUSINESS_OWNER'
  AND cur.`key` <> 'ADMINISTRATOR'
  AND COALESCE(cur.`baseKey`, '') <> 'ADMINISTRATOR';

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20260930100000_ownership_transfer_role_id', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20260930100000_ownership_transfer_role_id'
);

