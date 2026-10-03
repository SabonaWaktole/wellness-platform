-- Wellness Albania — Milestone 2 offer documents (M2 Slice 9) on a live MySQL
-- database.
--
-- Adds the offer's number and version (FR-OFR-08, 11), its ready time and
-- validity date (FR-OFR-10), the render snapshot frozen when it becomes Ready
-- (D2), the contact it is addressed to (FR-OFR-02), and DocumentSequence,
-- the yearly counter numbers are taken from (D5). Every existing quotation is
-- numbered once, and Wellness Albania switches to the sales process (D6).
--
-- SAFE TO RUN ON PRODUCTION, AND SAFE TO RUN TWICE. `CREATE TABLE IF NOT
-- EXISTS`, information_schema guards on every column, index and foreign key,
-- and a backfill that only touches quotations without a number cover the
-- re-run.
--
-- The same statements are also carried by mysql_upgrade_to_current.sql,
-- which is the file to run when bringing a database up to date generally.
-- This one exists for applying just this change on its own.
--
-- TAKE A BACKUP FIRST:
--   mysqldump -u USER -p --single-transaction --routines DBNAME > backup.sql

SELECT 'm2 offer documents' AS step, DATABASE() AS db, NOW() AS at;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'contactPersonId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `contactPersonId` VARCHAR(191) NULL', 'SELECT ''skip: Quotation.contactPersonId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'number');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `number` VARCHAR(191) NULL', 'SELECT ''skip: Quotation.number'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'previousVersionId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `previousVersionId` VARCHAR(191) NULL', 'SELECT ''skip: Quotation.previousVersionId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'readyAt');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `readyAt` DATETIME(3) NULL', 'SELECT ''skip: Quotation.readyAt'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'renderSnapshot');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `renderSnapshot` JSON NULL', 'SELECT ''skip: Quotation.renderSnapshot'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'supersededAt');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `supersededAt` DATETIME(3) NULL', 'SELECT ''skip: Quotation.supersededAt'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'validUntil');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `validUntil` DATE NULL', 'SELECT ''skip: Quotation.validUntil'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'version');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1', 'SELECT ''skip: Quotation.version'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `DocumentSequence` (
    `tenantId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `next` INTEGER NOT NULL DEFAULT 1,

    PRIMARY KEY (`tenantId`, `kind`, `year`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND INDEX_NAME = 'Quotation_tenantId_status_validUntil_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Quotation_tenantId_status_validUntil_idx` ON `Quotation`(`tenantId`, `status`, `validUntil`)', 'SELECT ''skip: Quotation_tenantId_status_validUntil_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND INDEX_NAME = 'Quotation_contactPersonId_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Quotation_contactPersonId_idx` ON `Quotation`(`contactPersonId`)', 'SELECT ''skip: Quotation_contactPersonId_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND INDEX_NAME = 'Quotation_previousVersionId_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Quotation_previousVersionId_idx` ON `Quotation`(`previousVersionId`)', 'SELECT ''skip: Quotation_previousVersionId_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND INDEX_NAME = 'Quotation_tenantId_number_version_key');
SET @sql := IF(@needed = 0, 'CREATE UNIQUE INDEX `Quotation_tenantId_number_version_key` ON `Quotation`(`tenantId`, `number`, `version`)', 'SELECT ''skip: Quotation_tenantId_number_version_key'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=0;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND CONSTRAINT_NAME = 'Quotation_contactPersonId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD CONSTRAINT `Quotation_contactPersonId_fkey` FOREIGN KEY (`contactPersonId`) REFERENCES `ContactPerson`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT ''skip: Quotation.Quotation_contactPersonId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND CONSTRAINT_NAME = 'Quotation_previousVersionId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD CONSTRAINT `Quotation_previousVersionId_fkey` FOREIGN KEY (`previousVersionId`) REFERENCES `Quotation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT ''skip: Quotation.Quotation_previousVersionId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DocumentSequence' AND CONSTRAINT_NAME = 'DocumentSequence_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `DocumentSequence` ADD CONSTRAINT `DocumentSequence_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: DocumentSequence.DocumentSequence_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET FOREIGN_KEY_CHECKS=1;

-- Number every quotation that has none (FR-OFR-08, NFR-OPS-02): per tenant
-- and per UTC year of createdAt, in createdAt order, with the tenant's offer
-- prefix (default OF), continuing from the year's counter, which then moves
-- past the last number used. A real table, not a TEMPORARY one: MySQL cannot
-- open a temporary table twice in one statement.
DROP TABLE IF EXISTS `_m2_offer_numbers`;
CREATE TABLE `_m2_offer_numbers` AS
SELECT q.`id`, q.`tenantId`, YEAR(q.`createdAt`) AS `year`,
       ROW_NUMBER() OVER (PARTITION BY q.`tenantId`, YEAR(q.`createdAt`) ORDER BY q.`createdAt`, q.`id`) AS `seq`
FROM `Quotation` q
WHERE q.`number` IS NULL;

INSERT IGNORE INTO `DocumentSequence` (`tenantId`, `kind`, `year`, `next`)
SELECT DISTINCT n.`tenantId`, 'OFFER', n.`year`, 1 FROM `_m2_offer_numbers` n;

UPDATE `Quotation` q
JOIN `_m2_offer_numbers` n ON n.`id` = q.`id`
JOIN `DocumentSequence` s ON s.`tenantId` = n.`tenantId` AND s.`kind` = 'OFFER' AND s.`year` = n.`year`
LEFT JOIN `PricingSettings` ps ON ps.`tenantId` = n.`tenantId`
SET q.`number` = CONCAT(
  COALESCE(ps.`offerNumberPrefix`, 'OF'), '-', n.`year`, '-',
  LPAD(s.`next` - 1 + n.`seq`, GREATEST(4, LENGTH(s.`next` - 1 + n.`seq`)), '0')
);

UPDATE `DocumentSequence` s
JOIN (
  SELECT `tenantId`, `year`, COUNT(*) AS `cnt` FROM `_m2_offer_numbers` GROUP BY `tenantId`, `year`
) c ON s.`tenantId` = c.`tenantId` AND s.`kind` = 'OFFER' AND s.`year` = c.`year`
SET s.`next` = s.`next` + c.`cnt`;

DROP TABLE `_m2_offer_numbers`;

-- Wellness Albania runs the sales process (D6): offers come from deals, and
-- the quotation email and public link are off (FR-OFR-07).
UPDATE `Tenant` SET `salesWorkflow` = 'SALES_PROCESS' WHERE `urlSlug` = 'wellness-albania';

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20261004100000_m2_offer_documents', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20261004100000_m2_offer_documents'
);

SELECT 'm2 offer documents complete' AS step, NOW() AS at;
