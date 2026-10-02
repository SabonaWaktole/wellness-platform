-- Wellness Albania — Milestone 2 draft offers (M2 Slice 8) on a live MySQL
-- database.
--
-- An offer is a Quotation with a deal (FR-OFR-01). Adds the offer's columns
-- to Quotation: the deal, the language, the note, the pricing inputs and the
-- rule values used (FR-OFR-04), and the Decimal amounts (NFR-ACC-02). Adds
-- QuotationService, the package's services copied onto the offer (FR-PRC-11),
-- and the current offer's value on Deal. Every new column is nullable or has
-- a default, so existing quotations are unchanged and nothing is backfilled.
--
-- SAFE TO RUN ON PRODUCTION, AND SAFE TO RUN TWICE. `CREATE TABLE IF NOT
-- EXISTS` and information_schema guards on every column, index and foreign
-- key cover the re-run.
--
-- The same statements are also carried by mysql_upgrade_to_current.sql,
-- which is the file to run when bringing a database up to date generally.
-- This one exists for applying just this change on its own.
--
-- TAKE A BACKUP FIRST:
--   mysqldump -u USER -p --single-transaction --routines DBNAME > backup.sql

SELECT 'm2 draft offers' AS step, DATABASE() AS db, NOW() AS at;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'annualValue');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `annualValue` DECIMAL(12, 2) NULL', 'SELECT ''skip: Quotation.annualValue'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'baseFee');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `baseFee` DECIMAL(12, 2) NULL', 'SELECT ''skip: Quotation.baseFee'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'dealId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `dealId` VARCHAR(191) NULL', 'SELECT ''skip: Quotation.dealId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'discountAmount');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `discountAmount` DECIMAL(12, 2) NULL', 'SELECT ''skip: Quotation.discountAmount'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'discountPercent');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `discountPercent` DECIMAL(7, 2) NULL', 'SELECT ''skip: Quotation.discountPercent'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'employeesPriced');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `employeesPriced` INTEGER NULL', 'SELECT ''skip: Quotation.employeesPriced'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'frequencyId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `frequencyId` VARCHAR(191) NULL', 'SELECT ''skip: Quotation.frequencyId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'language');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `language` VARCHAR(191) NOT NULL DEFAULT ''sq''', 'SELECT ''skip: Quotation.language'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'listPrice');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `listPrice` DECIMAL(12, 2) NULL', 'SELECT ''skip: Quotation.listPrice'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'locationFee');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `locationFee` DECIMAL(12, 2) NULL', 'SELECT ''skip: Quotation.locationFee'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'netMonthlyPrice');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `netMonthlyPrice` DECIMAL(12, 2) NULL', 'SELECT ''skip: Quotation.netMonthlyPrice'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'note');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `note` TEXT NULL', 'SELECT ''skip: Quotation.note'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'packageId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `packageId` VARCHAR(191) NULL', 'SELECT ''skip: Quotation.packageId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'pricePerEmployee');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `pricePerEmployee` DECIMAL(12, 2) NULL', 'SELECT ''skip: Quotation.pricePerEmployee'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'pricingInputs');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `pricingInputs` JSON NULL', 'SELECT ''skip: Quotation.pricingInputs'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'riskFee');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `riskFee` DECIMAL(12, 2) NULL', 'SELECT ''skip: Quotation.riskFee'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'ruleSnapshot');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `ruleSnapshot` JSON NULL', 'SELECT ''skip: Quotation.ruleSnapshot'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'visitFee');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `visitFee` DECIMAL(12, 2) NULL', 'SELECT ''skip: Quotation.visitFee'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'zoneId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `zoneId` VARCHAR(191) NULL', 'SELECT ''skip: Quotation.zoneId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Deal' AND COLUMN_NAME = 'offerAnnualValue');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Deal` ADD COLUMN `offerAnnualValue` DECIMAL(12, 2) NULL', 'SELECT ''skip: Deal.offerAnnualValue'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Deal' AND COLUMN_NAME = 'offerNetMonthlyPrice');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Deal` ADD COLUMN `offerNetMonthlyPrice` DECIMAL(12, 2) NULL', 'SELECT ''skip: Deal.offerNetMonthlyPrice'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


CREATE TABLE IF NOT EXISTS `QuotationService` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `quotationId` VARCHAR(191) NOT NULL,
    `serviceId` VARCHAR(191) NULL,
    `nameSq` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(191) NULL,
    `descriptionSq` TEXT NULL,
    `descriptionEn` TEXT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,

    INDEX `QuotationService_tenantId_quotationId_idx`(`tenantId`, `quotationId`),
    INDEX `QuotationService_quotationId_idx`(`quotationId`),
    INDEX `QuotationService_serviceId_idx`(`serviceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND INDEX_NAME = 'Quotation_tenantId_dealId_status_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Quotation_tenantId_dealId_status_idx` ON `Quotation`(`tenantId`, `dealId`, `status`)', 'SELECT ''skip: Quotation_tenantId_dealId_status_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND INDEX_NAME = 'Quotation_dealId_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Quotation_dealId_idx` ON `Quotation`(`dealId`)', 'SELECT ''skip: Quotation_dealId_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND INDEX_NAME = 'Quotation_packageId_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Quotation_packageId_idx` ON `Quotation`(`packageId`)', 'SELECT ''skip: Quotation_packageId_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND INDEX_NAME = 'Quotation_frequencyId_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Quotation_frequencyId_idx` ON `Quotation`(`frequencyId`)', 'SELECT ''skip: Quotation_frequencyId_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND INDEX_NAME = 'Quotation_zoneId_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Quotation_zoneId_idx` ON `Quotation`(`zoneId`)', 'SELECT ''skip: Quotation_zoneId_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Deal' AND INDEX_NAME = 'Deal_tenantId_stageKey_offerNetMonthlyPrice_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Deal_tenantId_stageKey_offerNetMonthlyPrice_idx` ON `Deal`(`tenantId`, `stageKey`, `offerNetMonthlyPrice`)', 'SELECT ''skip: Deal_tenantId_stageKey_offerNetMonthlyPrice_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=0;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND CONSTRAINT_NAME = 'Quotation_dealId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD CONSTRAINT `Quotation_dealId_fkey` FOREIGN KEY (`dealId`) REFERENCES `Deal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Quotation.Quotation_dealId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND CONSTRAINT_NAME = 'Quotation_packageId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD CONSTRAINT `Quotation_packageId_fkey` FOREIGN KEY (`packageId`) REFERENCES `ServicePackage`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Quotation.Quotation_packageId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND CONSTRAINT_NAME = 'Quotation_frequencyId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD CONSTRAINT `Quotation_frequencyId_fkey` FOREIGN KEY (`frequencyId`) REFERENCES `VisitFrequency`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Quotation.Quotation_frequencyId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND CONSTRAINT_NAME = 'Quotation_zoneId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD CONSTRAINT `Quotation_zoneId_fkey` FOREIGN KEY (`zoneId`) REFERENCES `PriceZone`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Quotation.Quotation_zoneId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'QuotationService' AND CONSTRAINT_NAME = 'QuotationService_quotationId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `QuotationService` ADD CONSTRAINT `QuotationService_quotationId_fkey` FOREIGN KEY (`quotationId`) REFERENCES `Quotation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: QuotationService.QuotationService_quotationId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'QuotationService' AND CONSTRAINT_NAME = 'QuotationService_serviceId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `QuotationService` ADD CONSTRAINT `QuotationService_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `Service`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT ''skip: QuotationService.QuotationService_serviceId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET FOREIGN_KEY_CHECKS=1;

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20261003100000_m2_draft_offers', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20261003100000_m2_draft_offers'
);

SELECT 'm2 draft offers complete' AS step, NOW() AS at;
