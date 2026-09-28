-- Wellness Albania — add the FollowUpInterval/LostReason lists and seed the
-- placeholder values on a live MySQL database (Slice 10: FR-SET-05, 06, 10).
--
-- SAFE TO RUN ON PRODUCTION, AND SAFE TO RUN TWICE. `CREATE TABLE IF NOT
-- EXISTS`, information_schema guards on the foreign keys, and `WHERE NOT
-- EXISTS (...)` on each seed INSERT cover the re-run. A workspace that already
-- has follow-up intervals or lost reasons keeps them and gets no placeholders.
--
-- The same statements are also carried by mysql_upgrade_to_current.sql, which
-- is the file to run when bringing a database up to date generally. This one
-- exists for applying just this change on its own.
--
-- TAKE A BACKUP FIRST:
--   mysqldump -u USER -p --single-transaction --routines DBNAME > backup.sql

SELECT 'adding FollowUpInterval/LostReason tables' AS step, DATABASE() AS db, NOW() AS at;

-- Tables are created with their final shape; a database that already has
-- them skips straight to the seed, which is also guarded.
CREATE TABLE IF NOT EXISTS `FollowUpInterval` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `days` INTEGER NOT NULL,
    `nameSq` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(191) NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FollowUpInterval_tenantId_order_idx`(`tenantId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `LostReason` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `nameSq` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(191) NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LostReason_tenantId_order_idx`(`tenantId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=0;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'FollowUpInterval' AND CONSTRAINT_NAME = 'FollowUpInterval_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `FollowUpInterval` ADD CONSTRAINT `FollowUpInterval_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: FollowUpInterval.FollowUpInterval_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'LostReason' AND CONSTRAINT_NAME = 'LostReason_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `LostReason` ADD CONSTRAINT `LostReason_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: LostReason.LostReason_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET FOREIGN_KEY_CHECKS=1;

-- Seed (FR-SET-10): the placeholder lists in src/lookups/domain/DefaultLookups.ts,
-- for every workspace that has none yet. Same values as the Postgres migration.
INSERT INTO `FollowUpInterval` (`id`, `tenantId`, `days`, `nameSq`, `nameEn`, `order`, `updatedAt`)
SELECT UUID(), t.id, v.days, v.namesq, v.nameen, v.ord, NOW(3)
FROM `Tenant` t
CROSS JOIN (
  SELECT 3 AS days, '3 ditë' AS namesq, '3 days' AS nameen, 1 AS ord
  UNION ALL
  SELECT 5, '5 ditë', '5 days', 2
  UNION ALL
  SELECT 7, '7 ditë', '7 days', 3
) v
WHERE NOT EXISTS (SELECT 1 FROM `FollowUpInterval` f WHERE f.tenantId = t.id);

INSERT INTO `LostReason` (`id`, `tenantId`, `nameSq`, `nameEn`, `order`, `updatedAt`)
SELECT UUID(), t.id, v.namesq, v.nameen, v.ord, NOW(3)
FROM `Tenant` t
CROSS JOIN (
  SELECT 'Shumë e shtrenjtë' AS namesq, 'Too expensive' AS nameen, 1 AS ord
  UNION ALL
  SELECT 'Ka tashmë një ofrues', 'Already has a provider', 2
  UNION ALL
  SELECT 'Pa buxhet', 'No budget', 3
  UNION ALL
  SELECT 'Pa përgjigje', 'No response', 4
) v
WHERE NOT EXISTS (SELECT 1 FROM `LostReason` l WHERE l.tenantId = t.id);

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20260928173234_add_sales_lists', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20260928173234_add_sales_lists'
);

SELECT item, IF(present > 0, 'OK', 'STILL MISSING') AS state FROM (
  SELECT 'FollowUpInterval table' AS item, COUNT(*) AS present FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='FollowUpInterval'
  UNION ALL SELECT 'LostReason table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='LostReason'
) AS checks;

SELECT 'FollowUpInterval/LostReason tables ready' AS step, NOW() AS at;
