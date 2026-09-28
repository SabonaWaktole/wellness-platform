-- Wellness Albania — the Slice 11 company profile fields on Client, and the
-- client status fixed set, on a live MySQL database (FR-CMP-01, 02, 03; Q8,
-- Q9).
--
-- SAFE TO RUN ON PRODUCTION, AND SAFE TO RUN TWICE. Every `ALTER TABLE` is
-- guarded with information_schema, the unique index add is guarded the same
-- way, and the status remap only ever touches rows still on the old value.
--
-- The same statements are also carried by mysql_upgrade_to_current.sql, which
-- is the file to run when bringing a database up to date generally. This one
-- exists for applying just this change on its own.
--
-- TAKE A BACKUP FIRST:
--   mysqldump -u USER -p --single-transaction --routines DBNAME > backup.sql

SELECT 'adding Client company profile fields' AS step, DATABASE() AS db, NOW() AS at;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Client' AND COLUMN_NAME = 'businessTypeId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Client` ADD COLUMN `businessTypeId` VARCHAR(191) NULL', 'SELECT ''skip: Client.businessTypeId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Client' AND COLUMN_NAME = 'employeeCount');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Client` ADD COLUMN `employeeCount` INTEGER NULL', 'SELECT ''skip: Client.employeeCount'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Client' AND COLUMN_NAME = 'areaId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Client` ADD COLUMN `areaId` VARCHAR(191) NULL', 'SELECT ''skip: Client.areaId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Client' AND COLUMN_NAME = 'cityId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Client` ADD COLUMN `cityId` VARCHAR(191) NULL', 'SELECT ''skip: Client.cityId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Client' AND COLUMN_NAME = 'streetAddress');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Client` ADD COLUMN `streetAddress` VARCHAR(191) NULL', 'SELECT ''skip: Client.streetAddress'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Client' AND COLUMN_NAME = 'taxId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Client` ADD COLUMN `taxId` VARCHAR(191) NULL', 'SELECT ''skip: Client.taxId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Client' AND COLUMN_NAME = 'website');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Client` ADD COLUMN `website` VARCHAR(191) NULL', 'SELECT ''skip: Client.website'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Client' AND INDEX_NAME = 'Client_tenantId_businessTypeId_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Client_tenantId_businessTypeId_idx` ON `Client`(`tenantId`, `businessTypeId`)', 'SELECT ''skip: Client_tenantId_businessTypeId_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Client' AND INDEX_NAME = 'Client_tenantId_areaId_cityId_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Client_tenantId_areaId_cityId_idx` ON `Client`(`tenantId`, `areaId`, `cityId`)', 'SELECT ''skip: Client_tenantId_areaId_cityId_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Client' AND INDEX_NAME = 'Client_tenantId_taxId_key');
SET @sql := IF(@needed = 0, 'CREATE UNIQUE INDEX `Client_tenantId_taxId_key` ON `Client`(`tenantId`, `taxId`)', 'SELECT ''skip: Client_tenantId_taxId_key'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=0;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Client' AND CONSTRAINT_NAME = 'Client_businessTypeId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Client` ADD CONSTRAINT `Client_businessTypeId_fkey` FOREIGN KEY (`businessTypeId`) REFERENCES `BusinessType`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Client.Client_businessTypeId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Client' AND CONSTRAINT_NAME = 'Client_areaId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Client` ADD CONSTRAINT `Client_areaId_fkey` FOREIGN KEY (`areaId`) REFERENCES `Area`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Client.Client_areaId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Client' AND CONSTRAINT_NAME = 'Client_cityId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Client` ADD CONSTRAINT `Client_cityId_fkey` FOREIGN KEY (`cityId`) REFERENCES `City`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Client.Client_cityId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET FOREIGN_KEY_CHECKS=1;

-- Client status fixed set (Q9): LEAD, PROSPECT, CLIENT, FORMER_CLIENT.
-- ACTIVE -> CLIENT, INACTIVE -> FORMER_CLIENT, PROSPECT unchanged. LEAD has
-- no legacy equivalent, so no row is remapped onto it. Any other legacy value
-- is left as-is, for Slice 14's "needs completion" report.
UPDATE `Client` SET `status` = 'CLIENT' WHERE `status` = 'ACTIVE';
UPDATE `Client` SET `status` = 'FORMER_CLIENT' WHERE `status` = 'INACTIVE';

-- The same remap, applied at each tenant's own STATUS custom field key
-- (FieldRole.STATUS's fieldName is tenant-renameable, so this cannot be a
-- fixed column name).
UPDATE `Client` c
JOIN `CustomFieldDefinition` cfd
  ON cfd.`tenantId` = c.`tenantId` AND cfd.`role` = 'STATUS'
SET c.`customFieldValues` = JSON_SET(
  c.`customFieldValues`,
  CONCAT('$."', cfd.`fieldName`, '"'),
  CASE JSON_UNQUOTE(JSON_EXTRACT(c.`customFieldValues`, CONCAT('$."', cfd.`fieldName`, '"')))
    WHEN 'ACTIVE' THEN 'CLIENT'
    WHEN 'INACTIVE' THEN 'FORMER_CLIENT'
    ELSE JSON_UNQUOTE(JSON_EXTRACT(c.`customFieldValues`, CONCAT('$."', cfd.`fieldName`, '"')))
  END
)
WHERE JSON_UNQUOTE(JSON_EXTRACT(c.`customFieldValues`, CONCAT('$."', cfd.`fieldName`, '"'))) IN ('ACTIVE', 'INACTIVE');

-- The STATUS field's own option list, so re-editing it shows the fixed set.
UPDATE `CustomFieldDefinition`
SET `options` = JSON_ARRAY('LEAD', 'PROSPECT', 'CLIENT', 'FORMER_CLIENT')
WHERE `role` = 'STATUS';

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20260928190105_add_client_company_fields', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20260928190105_add_client_company_fields'
);

SELECT item, IF(present > 0, 'OK', 'STILL MISSING') AS state FROM (
  SELECT 'Client.businessTypeId column' AS item, COUNT(*) AS present FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Client' AND COLUMN_NAME='businessTypeId'
  UNION ALL SELECT 'Client rows still on a legacy status', COUNT(*) FROM `Client`
   WHERE `status` IN ('ACTIVE', 'INACTIVE')
) AS checks;

SELECT 'Client company profile fields ready' AS step, NOW() AS at;
