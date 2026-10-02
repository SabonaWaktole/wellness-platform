-- Wellness Albania — Milestone 2 services, packages and offer settings (M2
-- Slice 4) on a live MySQL database.
--
-- Adds the offer settings to PricingSettings (validity, contract months,
-- number prefix, company details, the standard texts in sq and en), the
-- Service, ServicePackage and PackageService tables, and seeds the
-- placeholder services, the default "Standard" package and the texts for
-- every workspace (FR-PCF-06, FR-PCF-08; Q5, Q6, Q9, Q11).
--
-- SAFE TO RUN ON PRODUCTION, AND SAFE TO RUN TWICE. information_schema guards
-- on every column and foreign key, `CREATE TABLE IF NOT EXISTS`, and
-- `WHERE NOT EXISTS (...)` on each seed INSERT cover the re-run. The offer
-- settings are seeded only by the run that adds their columns.
--
-- Run after mysql_migration_m2_pricing_config.sql, which creates
-- PricingSettings. The same statements are also carried by
-- mysql_upgrade_to_current.sql, which is the file to run when bringing a
-- database up to date generally. This one exists for applying just this
-- change on its own.
--
-- TAKE A BACKUP FIRST:
--   mysqldump -u USER -p --single-transaction --routines DBNAME > backup.sql

SELECT 'm2 services, packages and offer settings' AS step, DATABASE() AS db, NOW() AS at;

-- Run before the columns are added: whether this database is getting the
-- offer settings for the first time. Only then are they seeded, so a second
-- run never refills a value the Administrator has since cleared.
SET @offerSettingsFresh := (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PricingSettings' AND COLUMN_NAME = 'offerNumberPrefix');

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PricingSettings' AND COLUMN_NAME = 'offerValidityDays');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PricingSettings` ADD COLUMN `offerValidityDays` INTEGER NOT NULL DEFAULT 30', 'SELECT ''skip: PricingSettings.offerValidityDays'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PricingSettings' AND COLUMN_NAME = 'contractMonthsDefault');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PricingSettings` ADD COLUMN `contractMonthsDefault` INTEGER NOT NULL DEFAULT 12', 'SELECT ''skip: PricingSettings.contractMonthsDefault'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PricingSettings' AND COLUMN_NAME = 'offerNumberPrefix');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PricingSettings` ADD COLUMN `offerNumberPrefix` VARCHAR(191) NOT NULL DEFAULT ''OF''', 'SELECT ''skip: PricingSettings.offerNumberPrefix'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PricingSettings' AND COLUMN_NAME = 'companyName');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PricingSettings` ADD COLUMN `companyName` VARCHAR(191) NULL', 'SELECT ''skip: PricingSettings.companyName'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PricingSettings' AND COLUMN_NAME = 'nipt');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PricingSettings` ADD COLUMN `nipt` VARCHAR(191) NULL', 'SELECT ''skip: PricingSettings.nipt'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PricingSettings' AND COLUMN_NAME = 'address');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PricingSettings` ADD COLUMN `address` TEXT NULL', 'SELECT ''skip: PricingSettings.address'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PricingSettings' AND COLUMN_NAME = 'phone');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PricingSettings` ADD COLUMN `phone` VARCHAR(191) NULL', 'SELECT ''skip: PricingSettings.phone'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PricingSettings' AND COLUMN_NAME = 'email');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PricingSettings` ADD COLUMN `email` VARCHAR(191) NULL', 'SELECT ''skip: PricingSettings.email'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PricingSettings' AND COLUMN_NAME = 'website');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PricingSettings` ADD COLUMN `website` VARCHAR(191) NULL', 'SELECT ''skip: PricingSettings.website'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PricingSettings' AND COLUMN_NAME = 'bankDetails');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PricingSettings` ADD COLUMN `bankDetails` TEXT NULL', 'SELECT ''skip: PricingSettings.bankDetails'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PricingSettings' AND COLUMN_NAME = 'introSq');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PricingSettings` ADD COLUMN `introSq` JSON NULL', 'SELECT ''skip: PricingSettings.introSq'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PricingSettings' AND COLUMN_NAME = 'introEn');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PricingSettings` ADD COLUMN `introEn` JSON NULL', 'SELECT ''skip: PricingSettings.introEn'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PricingSettings' AND COLUMN_NAME = 'termsSq');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PricingSettings` ADD COLUMN `termsSq` JSON NULL', 'SELECT ''skip: PricingSettings.termsSq'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PricingSettings' AND COLUMN_NAME = 'termsEn');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PricingSettings` ADD COLUMN `termsEn` JSON NULL', 'SELECT ''skip: PricingSettings.termsEn'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PricingSettings' AND COLUMN_NAME = 'closingSq');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PricingSettings` ADD COLUMN `closingSq` JSON NULL', 'SELECT ''skip: PricingSettings.closingSq'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PricingSettings' AND COLUMN_NAME = 'closingEn');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PricingSettings` ADD COLUMN `closingEn` JSON NULL', 'SELECT ''skip: PricingSettings.closingEn'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `Service` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `nameSq` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(191) NULL,
    `descriptionSq` TEXT NULL,
    `descriptionEn` TEXT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Service_tenantId_order_idx`(`tenantId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `ServicePackage` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `nameSq` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(191) NULL,
    `descriptionSq` TEXT NULL,
    `descriptionEn` TEXT NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `order` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ServicePackage_tenantId_order_idx`(`tenantId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `PackageService` (
    `packageId` VARCHAR(191) NOT NULL,
    `serviceId` VARCHAR(191) NOT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,

    INDEX `PackageService_serviceId_idx`(`serviceId`),
    PRIMARY KEY (`packageId`, `serviceId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=0;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Service' AND CONSTRAINT_NAME = 'Service_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Service` ADD CONSTRAINT `Service_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: Service.Service_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ServicePackage' AND CONSTRAINT_NAME = 'ServicePackage_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `ServicePackage` ADD CONSTRAINT `ServicePackage_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: ServicePackage.ServicePackage_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PackageService' AND CONSTRAINT_NAME = 'PackageService_packageId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PackageService` ADD CONSTRAINT `PackageService_packageId_fkey` FOREIGN KEY (`packageId`) REFERENCES `ServicePackage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: PackageService.PackageService_packageId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PackageService' AND CONSTRAINT_NAME = 'PackageService_serviceId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PackageService` ADD CONSTRAINT `PackageService_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `Service`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: PackageService.PackageService_serviceId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET FOREIGN_KEY_CHECKS=1;

-- Seed (Q5, Q6, Q9, Q11): the defaults in
-- src/pricing/domain/DefaultOfferSettings.ts. Same values as the Postgres
-- migration. The numbers came with their column defaults above; the company
-- name starts as the workspace name.
UPDATE `PricingSettings` p
JOIN `Tenant` t ON t.id = p.tenantId
SET p.`companyName` = t.`name`,
    p.`introSq` = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Ju falënderojmë për interesin tuaj. Më poshtë gjeni ofertën tonë për shërbimet e sigurisë dhe shëndetit në punë."}]}]}',
    p.`introEn` = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Thank you for your interest. Below is our offer for health and safety services at work."}]}]}',
    p.`termsSq` = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Çmimet janë mujore, në EUR."}]},{"type":"paragraph","content":[{"type":"text","text":"TVSH nuk përfshihet."}]}]}',
    p.`termsEn` = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Prices are monthly, in EUR."}]},{"type":"paragraph","content":[{"type":"text","text":"VAT not included."}]}]}',
    p.`closingSq` = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Mbetemi në dispozicion për çdo pyetje."}]}]}',
    p.`closingEn` = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"We remain at your disposal for any questions."}]}]}'
WHERE @offerSettingsFresh = 1;

INSERT INTO `Service` (`id`, `tenantId`, `nameSq`, `nameEn`, `descriptionSq`, `descriptionEn`, `order`, `updatedAt`)
SELECT UUID(), t.id, v.namesq, v.nameen, v.descriptionsq, v.descriptionen, v.ord, NOW(3)
FROM `Tenant` t
CROSS JOIN (
  SELECT 'Vlerësimi i riskut' AS namesq, 'Risk assessment' AS nameen, 'Vlerësimi i rreziqeve për sigurinë dhe shëndetin në vendin e punës.' AS descriptionsq, 'Assessment of the health and safety risks at the workplace.' AS descriptionen, 1 AS ord
  UNION ALL
  SELECT 'Vizita mjekësore në punë', 'Occupational health visits', 'Vizitat e mjekut të punës në objekt, sipas frekuencës së zgjedhur.', 'Visits of the occupational physician on site, at the chosen frequency.', 2
  UNION ALL
  SELECT 'Trajnim për sigurinë dhe shëndetin në punë', 'Health and safety training', 'Trajnimi i punonjësve për sigurinë dhe shëndetin në punë.', 'Training of the employees in health and safety at work.', 3
) v
WHERE NOT EXISTS (SELECT 1 FROM `Service` s WHERE s.tenantId = t.id);

INSERT INTO `ServicePackage` (`id`, `tenantId`, `nameSq`, `nameEn`, `descriptionSq`, `descriptionEn`, `isDefault`, `order`, `updatedAt`)
SELECT UUID(), t.id, 'Standart', 'Standard', 'Paketa standarde e shërbimeve.', 'The standard package of services.', true, 1, NOW(3)
FROM `Tenant` t
WHERE NOT EXISTS (SELECT 1 FROM `ServicePackage` sp WHERE sp.tenantId = t.id);

-- The default package holds every default service, in order. A package that
-- already has services keeps them.
INSERT INTO `PackageService` (`packageId`, `serviceId`, `order`)
SELECT sp.id, s.id, v.ord
FROM (
  SELECT 'Vlerësimi i riskut' AS servicenamesq, 1 AS ord
  UNION ALL
  SELECT 'Vizita mjekësore në punë', 2
  UNION ALL
  SELECT 'Trajnim për sigurinë dhe shëndetin në punë', 3
) v
JOIN `ServicePackage` sp ON sp.`nameSq` = 'Standart' AND sp.`isDefault` = true
JOIN `Service` s ON s.tenantId = sp.tenantId AND s.`nameSq` = v.servicenamesq
WHERE NOT EXISTS (SELECT 1 FROM `PackageService` ps WHERE ps.packageId = sp.id);

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20261001100000_m2_services_offer_settings', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20261001100000_m2_services_offer_settings'
);

SELECT item, IF(present > 0, 'OK', 'STILL MISSING') AS state FROM (
  SELECT 'PricingSettings.offerValidityDays' AS item, COUNT(*) AS present FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='PricingSettings' AND COLUMN_NAME='offerValidityDays'
  UNION ALL SELECT 'PricingSettings.closingEn', COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='PricingSettings' AND COLUMN_NAME='closingEn'
  UNION ALL SELECT 'Service table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Service'
  UNION ALL SELECT 'ServicePackage table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ServicePackage'
  UNION ALL SELECT 'PackageService table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='PackageService'
) AS checks;

SELECT 'services and offer settings ready' AS step, NOW() AS at;
