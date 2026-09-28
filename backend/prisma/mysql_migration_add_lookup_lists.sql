-- Wellness Albania — add the RiskLevel/BusinessType lists and seed the
-- placeholder values on a live MySQL database (Slice 8: FR-SET-01, 02, 10).
--
-- SAFE TO RUN ON PRODUCTION, AND SAFE TO RUN TWICE. `CREATE TABLE IF NOT
-- EXISTS`, information_schema guards on the foreign keys, and `WHERE NOT
-- EXISTS (...)` on each seed INSERT cover the re-run. A workspace that already
-- has risk levels or business types keeps them and gets no placeholders.
--
-- The same statements are also carried by mysql_upgrade_to_current.sql, which
-- is the file to run when bringing a database up to date generally. This one
-- exists for applying just this change on its own.
--
-- TAKE A BACKUP FIRST:
--   mysqldump -u USER -p --single-transaction --routines DBNAME > backup.sql

SELECT 'adding RiskLevel/BusinessType tables' AS step, DATABASE() AS db, NOW() AS at;

-- Tables are created with their final shape; a database that already has
-- them skips straight to the seed, which is also guarded.
CREATE TABLE IF NOT EXISTS `RiskLevel` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `level` INTEGER NOT NULL,
    `nameSq` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `RiskLevel_tenantId_order_idx`(`tenantId`, `order`),
    UNIQUE INDEX `RiskLevel_tenantId_level_key`(`tenantId`, `level`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `BusinessType` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `nameSq` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(191) NULL,
    `riskLevelId` VARCHAR(191) NOT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `BusinessType_tenantId_order_idx`(`tenantId`, `order`),
    INDEX `BusinessType_riskLevelId_idx`(`riskLevelId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=0;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'RiskLevel' AND CONSTRAINT_NAME = 'RiskLevel_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `RiskLevel` ADD CONSTRAINT `RiskLevel_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: RiskLevel.RiskLevel_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'BusinessType' AND CONSTRAINT_NAME = 'BusinessType_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `BusinessType` ADD CONSTRAINT `BusinessType_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: BusinessType.BusinessType_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'BusinessType' AND CONSTRAINT_NAME = 'BusinessType_riskLevelId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `BusinessType` ADD CONSTRAINT `BusinessType_riskLevelId_fkey` FOREIGN KEY (`riskLevelId`) REFERENCES `RiskLevel`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: BusinessType.BusinessType_riskLevelId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET FOREIGN_KEY_CHECKS=1;

-- Seed (FR-SET-10): the placeholder lists in src/lookups/domain/DefaultLookups.ts,
-- for every workspace that has none yet. Same values as the Postgres migration.
INSERT INTO `RiskLevel` (`id`, `tenantId`, `level`, `nameSq`, `nameEn`, `description`, `order`, `updatedAt`)
SELECT UUID(), t.id, v.lvl, v.namesq, v.nameen, v.description, v.ord, NOW(3)
FROM `Tenant` t
CROSS JOIN (
  SELECT 1 AS lvl, 'Niveli 1' AS namesq, 'Level 1' AS nameen, 'Rrezik i ulët' AS description, 1 AS ord
  UNION ALL
  SELECT 2 AS lvl, 'Niveli 2' AS namesq, 'Level 2' AS nameen, 'Rrezik i mesëm' AS description, 2 AS ord
  UNION ALL
  SELECT 3 AS lvl, 'Niveli 3' AS namesq, 'Level 3' AS nameen, 'Rrezik i lartë' AS description, 3 AS ord
) v
WHERE NOT EXISTS (SELECT 1 FROM `RiskLevel` r WHERE r.tenantId = t.id);

INSERT INTO `BusinessType` (`id`, `tenantId`, `nameSq`, `nameEn`, `riskLevelId`, `order`, `updatedAt`)
SELECT UUID(), t.id, v.namesq, v.nameen, r.id, v.ord, NOW(3)
FROM `Tenant` t
CROSS JOIN (
  SELECT 'Qendër thirrjesh' AS namesq, 'Call center' AS nameen, 1 AS risklevel, 1 AS ord
  UNION ALL
  SELECT 'Zyrë' AS namesq, 'Office' AS nameen, 1 AS risklevel, 2 AS ord
  UNION ALL
  SELECT 'Kafene' AS namesq, 'Café' AS nameen, 1 AS risklevel, 3 AS ord
  UNION ALL
  SELECT 'Dyqan' AS namesq, 'Retail shop' AS nameen, 1 AS risklevel, 4 AS ord
  UNION ALL
  SELECT 'Restorant' AS namesq, 'Restaurant' AS nameen, 2 AS risklevel, 5 AS ord
  UNION ALL
  SELECT 'Hotel' AS namesq, 'Hotel' AS nameen, 2 AS risklevel, 6 AS ord
  UNION ALL
  SELECT 'Magazinë' AS namesq, 'Warehouse' AS nameen, 2 AS risklevel, 7 AS ord
  UNION ALL
  SELECT 'Ndërtim' AS namesq, 'Construction' AS nameen, 3 AS risklevel, 8 AS ord
  UNION ALL
  SELECT 'Fabrikë' AS namesq, 'Factory' AS nameen, 3 AS risklevel, 9 AS ord
) v
JOIN `RiskLevel` r ON r.tenantId = t.id AND r.`level` = v.risklevel
WHERE NOT EXISTS (SELECT 1 FROM `BusinessType` b WHERE b.tenantId = t.id);

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20260928140000_add_lookup_lists', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20260928140000_add_lookup_lists'
);

SELECT item, IF(present > 0, 'OK', 'STILL MISSING') AS state FROM (
  SELECT 'RiskLevel table' AS item, COUNT(*) AS present FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='RiskLevel'
  UNION ALL SELECT 'BusinessType table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='BusinessType'
) AS checks;

SELECT 'RiskLevel/BusinessType tables ready' AS step, NOW() AS at;
