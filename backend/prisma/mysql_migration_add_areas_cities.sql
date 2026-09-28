-- Wellness Albania — add the Area/City lists and seed the placeholder qarqe
-- and cities on a live MySQL database (Slice 9: FR-SET-03, 04, 10).
--
-- SAFE TO RUN ON PRODUCTION, AND SAFE TO RUN TWICE. `CREATE TABLE IF NOT
-- EXISTS`, information_schema guards on the foreign keys, and `WHERE NOT
-- EXISTS (...)` on each seed INSERT cover the re-run. A workspace that already
-- has areas or cities keeps them and gets no placeholders.
--
-- The same statements are also carried by mysql_upgrade_to_current.sql, which
-- is the file to run when bringing a database up to date generally. This one
-- exists for applying just this change on its own.
--
-- TAKE A BACKUP FIRST:
--   mysqldump -u USER -p --single-transaction --routines DBNAME > backup.sql

SELECT 'adding Area/City tables' AS step, DATABASE() AS db, NOW() AS at;

-- Tables are created with their final shape; a database that already has
-- them skips straight to the seed, which is also guarded.
CREATE TABLE IF NOT EXISTS `Area` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `nameSq` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(191) NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Area_tenantId_order_idx`(`tenantId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `City` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `areaId` VARCHAR(191) NOT NULL,
    `nameSq` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(191) NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `City_tenantId_areaId_order_idx`(`tenantId`, `areaId`, `order`),
    UNIQUE INDEX `City_tenantId_areaId_nameSq_key`(`tenantId`, `areaId`, `nameSq`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=0;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Area' AND CONSTRAINT_NAME = 'Area_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Area` ADD CONSTRAINT `Area_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: Area.Area_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'City' AND CONSTRAINT_NAME = 'City_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `City` ADD CONSTRAINT `City_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: City.City_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'City' AND CONSTRAINT_NAME = 'City_areaId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `City` ADD CONSTRAINT `City_areaId_fkey` FOREIGN KEY (`areaId`) REFERENCES `Area`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: City.City_areaId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET FOREIGN_KEY_CHECKS=1;

-- Seed (FR-SET-10): the placeholder lists in src/lookups/domain/DefaultLookups.ts,
-- for every workspace that has none yet. Same values as the Postgres migration.
INSERT INTO `Area` (`id`, `tenantId`, `nameSq`, `nameEn`, `order`, `updatedAt`)
SELECT UUID(), t.id, v.namesq, v.nameen, v.ord, NOW(3)
FROM `Tenant` t
CROSS JOIN (
  SELECT 'Berat' AS namesq, 'Berat' AS nameen, 1 AS ord
  UNION ALL
  SELECT 'Dibër' AS namesq, 'Dibër' AS nameen, 2 AS ord
  UNION ALL
  SELECT 'Durrës' AS namesq, 'Durrës' AS nameen, 3 AS ord
  UNION ALL
  SELECT 'Elbasan' AS namesq, 'Elbasan' AS nameen, 4 AS ord
  UNION ALL
  SELECT 'Fier' AS namesq, 'Fier' AS nameen, 5 AS ord
  UNION ALL
  SELECT 'Gjirokastër' AS namesq, 'Gjirokastër' AS nameen, 6 AS ord
  UNION ALL
  SELECT 'Korçë' AS namesq, 'Korçë' AS nameen, 7 AS ord
  UNION ALL
  SELECT 'Kukës' AS namesq, 'Kukës' AS nameen, 8 AS ord
  UNION ALL
  SELECT 'Lezhë' AS namesq, 'Lezhë' AS nameen, 9 AS ord
  UNION ALL
  SELECT 'Shkodër' AS namesq, 'Shkodër' AS nameen, 10 AS ord
  UNION ALL
  SELECT 'Tiranë' AS namesq, 'Tirana' AS nameen, 11 AS ord
  UNION ALL
  SELECT 'Vlorë' AS namesq, 'Vlorë' AS nameen, 12 AS ord
) v
WHERE NOT EXISTS (SELECT 1 FROM `Area` a WHERE a.tenantId = t.id);

INSERT INTO `City` (`id`, `tenantId`, `areaId`, `nameSq`, `nameEn`, `order`, `updatedAt`)
SELECT UUID(), t.id, a.id, v.namesq, v.nameen, v.ord, NOW(3)
FROM `Tenant` t
CROSS JOIN (
  SELECT 'Berat' AS areanamesq, 'Berat' AS namesq, 'Berat' AS nameen, 1 AS ord
  UNION ALL
  SELECT 'Berat', 'Kuçovë', 'Kuçovë', 2
  UNION ALL
  SELECT 'Berat', 'Ura Vajgurore', 'Ura Vajgurore', 3
  UNION ALL
  SELECT 'Dibër', 'Peshkopi', 'Peshkopi', 1
  UNION ALL
  SELECT 'Dibër', 'Bulqizë', 'Bulqizë', 2
  UNION ALL
  SELECT 'Dibër', 'Burrel', 'Burrel', 3
  UNION ALL
  SELECT 'Durrës', 'Durrës', 'Durrës', 1
  UNION ALL
  SELECT 'Durrës', 'Shijak', 'Shijak', 2
  UNION ALL
  SELECT 'Durrës', 'Krujë', 'Krujë', 3
  UNION ALL
  SELECT 'Elbasan', 'Elbasan', 'Elbasan', 1
  UNION ALL
  SELECT 'Elbasan', 'Cërrik', 'Cërrik', 2
  UNION ALL
  SELECT 'Elbasan', 'Librazhd', 'Librazhd', 3
  UNION ALL
  SELECT 'Fier', 'Fier', 'Fier', 1
  UNION ALL
  SELECT 'Fier', 'Patos', 'Patos', 2
  UNION ALL
  SELECT 'Fier', 'Lushnjë', 'Lushnjë', 3
  UNION ALL
  SELECT 'Gjirokastër', 'Gjirokastër', 'Gjirokastër', 1
  UNION ALL
  SELECT 'Gjirokastër', 'Tepelenë', 'Tepelenë', 2
  UNION ALL
  SELECT 'Gjirokastër', 'Përmet', 'Përmet', 3
  UNION ALL
  SELECT 'Korçë', 'Korçë', 'Korçë', 1
  UNION ALL
  SELECT 'Korçë', 'Pogradec', 'Pogradec', 2
  UNION ALL
  SELECT 'Korçë', 'Bilisht', 'Bilisht', 3
  UNION ALL
  SELECT 'Kukës', 'Kukës', 'Kukës', 1
  UNION ALL
  SELECT 'Kukës', 'Krumë', 'Krumë', 2
  UNION ALL
  SELECT 'Kukës', 'Has', 'Has', 3
  UNION ALL
  SELECT 'Lezhë', 'Lezhë', 'Lezhë', 1
  UNION ALL
  SELECT 'Lezhë', 'Laç', 'Laç', 2
  UNION ALL
  SELECT 'Lezhë', 'Rrëshen', 'Rrëshen', 3
  UNION ALL
  SELECT 'Shkodër', 'Shkodër', 'Shkodër', 1
  UNION ALL
  SELECT 'Shkodër', 'Koplik', 'Koplik', 2
  UNION ALL
  SELECT 'Shkodër', 'Vau i Dejës', 'Vau i Dejës', 3
  UNION ALL
  SELECT 'Tiranë', 'Tiranë', 'Tirana', 1
  UNION ALL
  SELECT 'Tiranë', 'Kamëz', 'Kamëz', 2
  UNION ALL
  SELECT 'Tiranë', 'Kavajë', 'Kavajë', 3
  UNION ALL
  SELECT 'Vlorë', 'Vlorë', 'Vlorë', 1
  UNION ALL
  SELECT 'Vlorë', 'Sarandë', 'Sarandë', 2
  UNION ALL
  SELECT 'Vlorë', 'Himarë', 'Himarë', 3
) v
JOIN `Area` a ON a.tenantId = t.id AND a.`nameSq` = v.areanamesq
WHERE NOT EXISTS (SELECT 1 FROM `City` c WHERE c.tenantId = t.id);

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20260928140105_add_areas_cities', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20260928140105_add_areas_cities'
);

SELECT item, IF(present > 0, 'OK', 'STILL MISSING') AS state FROM (
  SELECT 'Area table' AS item, COUNT(*) AS present FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Area'
  UNION ALL SELECT 'City table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='City'
) AS checks;

SELECT 'Area/City tables ready' AS step, NOW() AS at;
