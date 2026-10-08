-- Wellness Albania — Milestone 4 Wellness+ settings and benefit table (M4
-- Slice 3) on a live MySQL database.
--
-- Adds TierSetting, MembershipSettings, FamilyRelationship, BenefitService and
-- BenefitDiscount, and seeds every workspace with the SRS defaults: four tiers
-- (Bronze free, Silver 60, Gold 100, VIP free, 12 months), the rules, the
-- relationship list and the 14-service benefit table with VIP equal to Gold.
--
-- SAFE TO RUN ON PRODUCTION, AND SAFE TO RUN TWICE: tables are created only if
-- missing and every seed INSERT is skipped for a workspace that already has
-- rows, so an Administrator's later changes are never overwritten.
--
-- The same statements are also carried by mysql_upgrade_to_current.sql, which
-- is the file to run when bringing a database up to date generally.
--
-- TAKE A BACKUP FIRST:
--   mysqldump -u USER -p --single-transaction --routines DBNAME > backup.sql

SELECT 'm4 wellness settings' AS step, DATABASE() AS db, NOW() AS at;

CREATE TABLE IF NOT EXISTS `TierSetting` (
    `tenantId` VARCHAR(191) NOT NULL,
    `tier` VARCHAR(191) NOT NULL,
    `labelSq` VARCHAR(191) NOT NULL,
    `labelEn` VARCHAR(191) NOT NULL,
    `colour` VARCHAR(191) NOT NULL,
    `fee` DECIMAL(12, 2) NULL,
    `termMonths` INTEGER NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedByUserId` VARCHAR(191) NULL,

    PRIMARY KEY (`tenantId`, `tier`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `MembershipSettings` (
    `tenantId` VARCHAR(191) NOT NULL,
    `familyDiscountPercent` DECIMAL(7, 2) NOT NULL DEFAULT 50,
    `graceDays` INTEGER NOT NULL DEFAULT 0,
    `expiringSoonDays` INTEGER NOT NULL DEFAULT 30,
    `memberPrefix` VARCHAR(191) NOT NULL DEFAULT 'WP',
    `receiptPrefix` VARCHAR(191) NOT NULL DEFAULT 'RCP',
    `vipReviewNoticeDays` INTEGER NOT NULL DEFAULT 30,
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedByUserId` VARCHAR(191) NULL,

    PRIMARY KEY (`tenantId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `FamilyRelationship` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `nameSq` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(191) NOT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,

    INDEX `FamilyRelationship_tenantId_order_idx`(`tenantId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `BenefitService` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `nameSq` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(191) NOT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,

    INDEX `BenefitService_tenantId_order_idx`(`tenantId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `BenefitDiscount` (
    `serviceId` VARCHAR(191) NOT NULL,
    `tier` VARCHAR(191) NOT NULL,
    `percent` DECIMAL(5, 2) NOT NULL,

    PRIMARY KEY (`serviceId`, `tier`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TierSetting' AND CONSTRAINT_NAME = 'TierSetting_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `TierSetting` ADD CONSTRAINT `TierSetting_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: TierSetting.TierSetting_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'MembershipSettings' AND CONSTRAINT_NAME = 'MembershipSettings_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `MembershipSettings` ADD CONSTRAINT `MembershipSettings_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: MembershipSettings.MembershipSettings_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'FamilyRelationship' AND CONSTRAINT_NAME = 'FamilyRelationship_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `FamilyRelationship` ADD CONSTRAINT `FamilyRelationship_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: FamilyRelationship.FamilyRelationship_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'BenefitService' AND CONSTRAINT_NAME = 'BenefitService_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `BenefitService` ADD CONSTRAINT `BenefitService_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: BenefitService.BenefitService_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'BenefitDiscount' AND CONSTRAINT_NAME = 'BenefitDiscount_serviceId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `BenefitDiscount` ADD CONSTRAINT `BenefitDiscount_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `BenefitService`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: BenefitDiscount.BenefitDiscount_serviceId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Seed: the defaults in src/membership/domain/DefaultMembership.ts for every
-- workspace that has none yet (NFR-OPS-04). A workspace that has any row of a
-- kind is left alone.
-- BEGIN GENERATED MEMBERSHIP SEED
INSERT INTO `TierSetting` (`tenantId`, `tier`, `labelSq`, `labelEn`, `colour`, `fee`, `termMonths`, `updatedAt`)
SELECT t.id, v.tier, v.labelsq, v.labelen, v.colour, v.fee, v.termmonths, NOW(3)
FROM `Tenant` t
CROSS JOIN (
  SELECT 'BRONZE' AS tier, 'Bronz' AS labelsq, 'Bronze' AS labelen, '#B26A2B' AS colour, NULL AS fee, NULL AS termmonths
  UNION ALL
  SELECT 'SILVER', 'Argjend', 'Silver', '#8A939B', 60.00, 12
  UNION ALL
  SELECT 'GOLD', 'Ar', 'Gold', '#C9A227', 100.00, 12
  UNION ALL
  SELECT 'VIP', 'VIP', 'VIP', '#5B3FA6', NULL, 12
) v
WHERE NOT EXISTS (SELECT 1 FROM `TierSetting` x WHERE x.tenantId = t.id);

INSERT INTO `MembershipSettings` (`tenantId`, `familyDiscountPercent`, `graceDays`, `expiringSoonDays`, `memberPrefix`, `receiptPrefix`, `vipReviewNoticeDays`, `updatedAt`)
SELECT t.id, 50.00, 0, 30, 'WP', 'RCP', 30, NOW(3)
FROM `Tenant` t
WHERE NOT EXISTS (SELECT 1 FROM `MembershipSettings` x WHERE x.tenantId = t.id);

INSERT INTO `FamilyRelationship` (`id`, `tenantId`, `nameSq`, `nameEn`, `order`)
SELECT UUID(), t.id, v.namesq, v.nameen, v.ord
FROM `Tenant` t
CROSS JOIN (
  SELECT 'Bashkëshort ose partner' AS namesq, 'Spouse or partner' AS nameen, 1 AS ord
  UNION ALL
  SELECT 'Fëmijë', 'Child', 2
  UNION ALL
  SELECT 'Prind', 'Parent', 3
) v
WHERE NOT EXISTS (SELECT 1 FROM `FamilyRelationship` x WHERE x.tenantId = t.id);

INSERT INTO `BenefitService` (`id`, `tenantId`, `nameSq`, `nameEn`, `order`)
SELECT UUID(), t.id, v.namesq, v.nameen, v.ord
FROM `Tenant` t
CROSS JOIN (
  SELECT 'Kontroll parandalues' AS namesq, 'Preventive check-up' AS nameen, 1 AS ord
  UNION ALL
  SELECT 'Qasje te internisti', 'Internist access', 2
  UNION ALL
  SELECT 'Masazh relaksues ose sportiv (ose 1 seancë fizioterapie për një gjendje ekzistuese)', 'Relaxing or sports massage (or 1 physiotherapy session for an existing condition)', 3
  UNION ALL
  SELECT 'Ekzaminime radiologjike', 'Radiology examinations', 4
  UNION ALL
  SELECT 'Vizita te gjinekologu', 'Gynecologist visits', 5
  UNION ALL
  SELECT 'Vizita te kardiologu', 'Cardiologist visits', 6
  UNION ALL
  SELECT 'Vizita te reumatologu', 'Rheumatologist visits', 7
  UNION ALL
  SELECT 'Vizita te dermatologu', 'Dermatologist visits', 8
  UNION ALL
  SELECT 'Vizita te endokrinologu', 'Endocrinologist visits', 9
  UNION ALL
  SELECT 'Vizita te pediatri', 'Pediatrician visits', 10
  UNION ALL
  SELECT 'Shërbime infermierore në shtëpi', 'Home nursing services', 11
  UNION ALL
  SELECT 'Seanca fizioterapie dhe rehabilitimi fizik', 'Physiotherapy and physical rehabilitation sessions', 12
  UNION ALL
  SELECT 'Analiza laboratorike', 'Laboratory tests', 13
  UNION ALL
  SELECT 'Skaner CT (të gjitha llojet)', 'CT scan (all types)', 14
) v
WHERE NOT EXISTS (SELECT 1 FROM `BenefitService` x WHERE x.tenantId = t.id);

-- Only a workspace with no discount at all gets the seeded ones, so a re-run never
-- puts back a discount the Administrator cleared.
INSERT INTO `BenefitDiscount` (`serviceId`, `tier`, `percent`)
SELECT s.id, v.tier, v.percent
FROM (
  SELECT 'Preventive check-up' AS nameen, 'BRONZE' AS tier, 25.00 AS percent
  UNION ALL
  SELECT 'Preventive check-up', 'SILVER', 50.00
  UNION ALL
  SELECT 'Preventive check-up', 'GOLD', 100.00
  UNION ALL
  SELECT 'Preventive check-up', 'VIP', 100.00
  UNION ALL
  SELECT 'Internist access', 'BRONZE', 100.00
  UNION ALL
  SELECT 'Internist access', 'SILVER', 100.00
  UNION ALL
  SELECT 'Internist access', 'GOLD', 100.00
  UNION ALL
  SELECT 'Internist access', 'VIP', 100.00
  UNION ALL
  SELECT 'Relaxing or sports massage (or 1 physiotherapy session for an existing condition)', 'GOLD', 100.00
  UNION ALL
  SELECT 'Relaxing or sports massage (or 1 physiotherapy session for an existing condition)', 'VIP', 100.00
  UNION ALL
  SELECT 'Radiology examinations', 'GOLD', 50.00
  UNION ALL
  SELECT 'Radiology examinations', 'VIP', 50.00
  UNION ALL
  SELECT 'Gynecologist visits', 'BRONZE', 10.00
  UNION ALL
  SELECT 'Gynecologist visits', 'SILVER', 20.00
  UNION ALL
  SELECT 'Gynecologist visits', 'GOLD', 30.00
  UNION ALL
  SELECT 'Gynecologist visits', 'VIP', 30.00
  UNION ALL
  SELECT 'Cardiologist visits', 'BRONZE', 10.00
  UNION ALL
  SELECT 'Cardiologist visits', 'SILVER', 20.00
  UNION ALL
  SELECT 'Cardiologist visits', 'GOLD', 30.00
  UNION ALL
  SELECT 'Cardiologist visits', 'VIP', 30.00
  UNION ALL
  SELECT 'Rheumatologist visits', 'BRONZE', 10.00
  UNION ALL
  SELECT 'Rheumatologist visits', 'SILVER', 20.00
  UNION ALL
  SELECT 'Rheumatologist visits', 'GOLD', 30.00
  UNION ALL
  SELECT 'Rheumatologist visits', 'VIP', 30.00
  UNION ALL
  SELECT 'Dermatologist visits', 'BRONZE', 10.00
  UNION ALL
  SELECT 'Dermatologist visits', 'SILVER', 15.00
  UNION ALL
  SELECT 'Dermatologist visits', 'GOLD', 30.00
  UNION ALL
  SELECT 'Dermatologist visits', 'VIP', 30.00
  UNION ALL
  SELECT 'Endocrinologist visits', 'BRONZE', 10.00
  UNION ALL
  SELECT 'Endocrinologist visits', 'SILVER', 20.00
  UNION ALL
  SELECT 'Endocrinologist visits', 'GOLD', 30.00
  UNION ALL
  SELECT 'Endocrinologist visits', 'VIP', 30.00
  UNION ALL
  SELECT 'Pediatrician visits', 'BRONZE', 10.00
  UNION ALL
  SELECT 'Pediatrician visits', 'SILVER', 20.00
  UNION ALL
  SELECT 'Pediatrician visits', 'GOLD', 30.00
  UNION ALL
  SELECT 'Pediatrician visits', 'VIP', 30.00
  UNION ALL
  SELECT 'Home nursing services', 'BRONZE', 10.00
  UNION ALL
  SELECT 'Home nursing services', 'GOLD', 30.00
  UNION ALL
  SELECT 'Home nursing services', 'VIP', 30.00
  UNION ALL
  SELECT 'Physiotherapy and physical rehabilitation sessions', 'BRONZE', 10.00
  UNION ALL
  SELECT 'Physiotherapy and physical rehabilitation sessions', 'SILVER', 20.00
  UNION ALL
  SELECT 'Physiotherapy and physical rehabilitation sessions', 'GOLD', 30.00
  UNION ALL
  SELECT 'Physiotherapy and physical rehabilitation sessions', 'VIP', 30.00
  UNION ALL
  SELECT 'Laboratory tests', 'SILVER', 15.00
) v
JOIN `BenefitService` s ON s.nameEn = v.nameen
WHERE NOT EXISTS (
  SELECT 1 FROM `BenefitDiscount` d JOIN `BenefitService` s2 ON s2.id = d.serviceId WHERE s2.tenantId = s.tenantId
);
-- END GENERATED MEMBERSHIP SEED

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20261018100000_m4_wellness_settings', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20261018100000_m4_wellness_settings'
);
