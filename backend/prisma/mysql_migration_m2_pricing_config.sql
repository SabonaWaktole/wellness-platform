-- Wellness Albania — Milestone 2 pricing configuration (M2 Slice 3) on a
-- live MySQL database.
--
-- Adds the pricing tables (employee bands, risk surcharges, visit
-- frequencies, price zones and their cities, and the workspace pricing
-- settings with the discount cap), adds Vorë to the Tiranë area, and seeds
-- the Figure 1 defaults for every workspace that has none yet
-- (FR-PCF-01..05, 07). Money and percentages are DECIMAL (NFR-ACC-02).
--
-- SAFE TO RUN ON PRODUCTION, AND SAFE TO RUN TWICE. `CREATE TABLE IF NOT
-- EXISTS`, information_schema guards on the foreign keys, and `WHERE NOT
-- EXISTS (...)` on each seed INSERT cover the re-run. A workspace that already
-- has pricing values keeps them.
--
-- The same statements are also carried by mysql_upgrade_to_current.sql, which
-- is the file to run when bringing a database up to date generally. This one
-- exists for applying just this change on its own.
--
-- TAKE A BACKUP FIRST:
--   mysqldump -u USER -p --single-transaction --routines DBNAME > backup.sql

SELECT 'm2 pricing configuration' AS step, DATABASE() AS db, NOW() AS at;

-- Tables are created with their final shape; a database that already has
-- them skips straight to the seed, which is also guarded.
CREATE TABLE IF NOT EXISTS `PricingSettings` (
    `tenantId` VARCHAR(191) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'EUR',
    `discountCapPercent` DECIMAL(7, 2) NOT NULL DEFAULT 10,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`tenantId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `EmployeeBand` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `minEmployees` INTEGER NOT NULL,
    `maxEmployees` INTEGER NOT NULL,
    `baseFee` DECIMAL(12, 2) NOT NULL,
    `perEmployeeFee` DECIMAL(12, 2) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `EmployeeBand_tenantId_minEmployees_idx`(`tenantId`, `minEmployees`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `RiskSurcharge` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `riskLevelId` VARCHAR(191) NOT NULL,
    `percent` DECIMAL(7, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `RiskSurcharge_riskLevelId_idx`(`riskLevelId`),
    UNIQUE INDEX `RiskSurcharge_tenantId_riskLevelId_key`(`tenantId`, `riskLevelId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `VisitFrequency` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `nameSq` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(191) NULL,
    `visitsPerYear` INTEGER NULL,
    `pricingType` VARCHAR(191) NOT NULL,
    `value` DECIMAL(12, 2) NOT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `VisitFrequency_tenantId_order_idx`(`tenantId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `PriceZone` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `nameSq` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(191) NULL,
    `surchargePercent` DECIMAL(7, 2) NOT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PriceZone_tenantId_order_idx`(`tenantId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `PriceZoneCity` (
    `zoneId` VARCHAR(191) NOT NULL,
    `cityId` VARCHAR(191) NOT NULL,

    INDEX `PriceZoneCity_cityId_idx`(`cityId`),
    PRIMARY KEY (`zoneId`, `cityId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=0;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PricingSettings' AND CONSTRAINT_NAME = 'PricingSettings_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PricingSettings` ADD CONSTRAINT `PricingSettings_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: PricingSettings.PricingSettings_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'EmployeeBand' AND CONSTRAINT_NAME = 'EmployeeBand_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `EmployeeBand` ADD CONSTRAINT `EmployeeBand_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: EmployeeBand.EmployeeBand_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'RiskSurcharge' AND CONSTRAINT_NAME = 'RiskSurcharge_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `RiskSurcharge` ADD CONSTRAINT `RiskSurcharge_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: RiskSurcharge.RiskSurcharge_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'RiskSurcharge' AND CONSTRAINT_NAME = 'RiskSurcharge_riskLevelId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `RiskSurcharge` ADD CONSTRAINT `RiskSurcharge_riskLevelId_fkey` FOREIGN KEY (`riskLevelId`) REFERENCES `RiskLevel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: RiskSurcharge.RiskSurcharge_riskLevelId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'VisitFrequency' AND CONSTRAINT_NAME = 'VisitFrequency_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `VisitFrequency` ADD CONSTRAINT `VisitFrequency_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: VisitFrequency.VisitFrequency_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PriceZone' AND CONSTRAINT_NAME = 'PriceZone_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PriceZone` ADD CONSTRAINT `PriceZone_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: PriceZone.PriceZone_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PriceZoneCity' AND CONSTRAINT_NAME = 'PriceZoneCity_zoneId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PriceZoneCity` ADD CONSTRAINT `PriceZoneCity_zoneId_fkey` FOREIGN KEY (`zoneId`) REFERENCES `PriceZone`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: PriceZoneCity.PriceZoneCity_zoneId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PriceZoneCity' AND CONSTRAINT_NAME = 'PriceZoneCity_cityId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PriceZoneCity` ADD CONSTRAINT `PriceZoneCity_cityId_fkey` FOREIGN KEY (`cityId`) REFERENCES `City`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: PriceZoneCity.PriceZoneCity_cityId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET FOREIGN_KEY_CHECKS=1;

-- Vorë joins the Tiranë area (M1 city list), so the "Kamëz and Vorë" price
-- zone can be seeded. Every workspace with a Tiranë area and no Vorë in it.
INSERT INTO `City` (`id`, `tenantId`, `areaId`, `nameSq`, `nameEn`, `order`, `updatedAt`)
SELECT UUID(), a.tenantId, a.id, v.namesq, v.nameen, v.ord, NOW(3)
FROM `Area` a
JOIN (
  SELECT 'Tiranë' AS areanamesq, 'Vorë' AS namesq, 'Vorë' AS nameen, 4 AS ord
) v ON a.`nameSq` = v.areanamesq
WHERE NOT EXISTS (SELECT 1 FROM `City` c WHERE c.areaId = a.id AND c.`nameSq` = v.namesq);

-- Seed (Q1, Q2, Q3, Q4, Q7): the defaults in src/pricing/domain/DefaultPricing.ts,
-- for every workspace that has none yet. Same values as the Postgres migration.
INSERT INTO `PricingSettings` (`tenantId`, `currency`, `discountCapPercent`, `updatedAt`)
SELECT t.id, 'EUR', 10.00, NOW(3)
FROM `Tenant` t
WHERE NOT EXISTS (SELECT 1 FROM `PricingSettings` p WHERE p.tenantId = t.id);

INSERT INTO `EmployeeBand` (`id`, `tenantId`, `minEmployees`, `maxEmployees`, `baseFee`, `perEmployeeFee`, `updatedAt`)
SELECT UUID(), t.id, v.minemployees, v.maxemployees, v.basefee, v.peremployeefee, NOW(3)
FROM `Tenant` t
CROSS JOIN (
  SELECT 1 AS minemployees, 10 AS maxemployees, 30.00 AS basefee, 8.00 AS peremployeefee
) v
WHERE NOT EXISTS (SELECT 1 FROM `EmployeeBand` b WHERE b.tenantId = t.id);

INSERT INTO `RiskSurcharge` (`id`, `tenantId`, `riskLevelId`, `percent`, `updatedAt`)
SELECT UUID(), t.id, r.id, v.percent, NOW(3)
FROM `Tenant` t
CROSS JOIN (
  SELECT 1 AS risklevel, 0.00 AS percent
  UNION ALL
  SELECT 2, 10.00
  UNION ALL
  SELECT 3, 20.00
) v
JOIN `RiskLevel` r ON r.tenantId = t.id AND r.`level` = v.risklevel
WHERE NOT EXISTS (SELECT 1 FROM `RiskSurcharge` s WHERE s.tenantId = t.id);

INSERT INTO `VisitFrequency` (`id`, `tenantId`, `nameSq`, `nameEn`, `visitsPerYear`, `pricingType`, `value`, `order`, `updatedAt`)
SELECT UUID(), t.id, v.namesq, v.nameen, v.visitsperyear, v.pricingtype, v.value, v.ord, NOW(3)
FROM `Tenant` t
CROSS JOIN (
  SELECT '1 herë në vit' AS namesq, 'Once a year' AS nameen, 1 AS visitsperyear, 'PERCENT' AS pricingtype, 0.00 AS value, 1 AS ord
  UNION ALL
  SELECT '2 herë në vit', 'Twice a year', 2, 'PERCENT', 20.00, 2
  UNION ALL
  SELECT '4 herë në vit', '4 times a year', 4, 'PERCENT', 35.00, 3
  UNION ALL
  SELECT '6 herë në vit', '6 times a year', 6, 'PERCENT', 50.00, 4
  UNION ALL
  SELECT 'Çdo muaj', 'Monthly', 12, 'PERCENT', 100.00, 5
  UNION ALL
  SELECT 'Sipas nevojës', 'Ad hoc', NULL, 'FIXED', 15.00, 6
) v
WHERE NOT EXISTS (SELECT 1 FROM `VisitFrequency` f WHERE f.tenantId = t.id);

INSERT INTO `PriceZone` (`id`, `tenantId`, `nameSq`, `nameEn`, `surchargePercent`, `order`, `updatedAt`)
SELECT UUID(), t.id, v.namesq, v.nameen, v.surchargepercent, v.ord, NOW(3)
FROM `Tenant` t
CROSS JOIN (
  SELECT 'Tirana qendër' AS namesq, 'Tirana centre' AS nameen, 0.00 AS surchargepercent, 1 AS ord
  UNION ALL
  SELECT 'Tirana periferi', 'Tirana suburbs', 15.00, 2
  UNION ALL
  SELECT 'Kamëz dhe Vorë', 'Kamëz and Vorë', 30.00, 3
  UNION ALL
  SELECT 'Elbasan dhe Durrës', 'Elbasan and Durrës', 100.00, 4
) v
WHERE NOT EXISTS (SELECT 1 FROM `PriceZone` z WHERE z.tenantId = t.id);

-- Cities are matched by area and city name, since "Tiranë" is unique only
-- within its area. A workspace whose zones already have cities keeps them.
INSERT INTO `PriceZoneCity` (`zoneId`, `cityId`)
SELECT z.id, c.id
FROM (
  SELECT 'Tirana qendër' AS zonenamesq, 'Tiranë' AS areanamesq, 'Tiranë' AS citynamesq
  UNION ALL
  SELECT 'Tirana periferi', 'Tiranë', 'Tiranë'
  UNION ALL
  SELECT 'Kamëz dhe Vorë', 'Tiranë', 'Kamëz'
  UNION ALL
  SELECT 'Kamëz dhe Vorë', 'Tiranë', 'Vorë'
  UNION ALL
  SELECT 'Elbasan dhe Durrës', 'Elbasan', 'Elbasan'
  UNION ALL
  SELECT 'Elbasan dhe Durrës', 'Durrës', 'Durrës'
) v
JOIN `PriceZone` z ON z.`nameSq` = v.zonenamesq
JOIN `Area` a ON a.tenantId = z.tenantId AND a.`nameSq` = v.areanamesq
JOIN `City` c ON c.areaId = a.id AND c.`nameSq` = v.citynamesq
WHERE NOT EXISTS (
  SELECT 1 FROM `PriceZoneCity` zc JOIN `PriceZone` oz ON oz.id = zc.zoneId WHERE oz.tenantId = z.tenantId
);

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20260930200000_m2_pricing_config', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20260930200000_m2_pricing_config'
);

SELECT item, IF(present > 0, 'OK', 'STILL MISSING') AS state FROM (
  SELECT 'PricingSettings table' AS item, COUNT(*) AS present FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='PricingSettings'
  UNION ALL SELECT 'EmployeeBand table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='EmployeeBand'
  UNION ALL SELECT 'RiskSurcharge table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='RiskSurcharge'
  UNION ALL SELECT 'VisitFrequency table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='VisitFrequency'
  UNION ALL SELECT 'PriceZone table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='PriceZone'
  UNION ALL SELECT 'PriceZoneCity table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='PriceZoneCity'
) AS checks;

SELECT 'pricing configuration ready' AS step, NOW() AS at;
