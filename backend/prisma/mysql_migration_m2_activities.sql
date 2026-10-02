-- Wellness Albania — Milestone 2 activities (M2 Slice 7) on a live MySQL
-- database.
--
-- Interactions become activities: when it happened, the contact person, the
-- deal, a result, the client's feedback and the next action (FR-ACT-01, 02).
-- Adds the ActivityResult list (FR-ACT-03), seeded with the defaults and with
-- the existing outcome categories, and fills `occurredAt` and `resultId` on
-- the interactions that already exist (FR-ACT-07). Nothing is deleted;
-- `outcomeCategoryId` stays until Milestone 3.
--
-- SAFE TO RUN ON PRODUCTION, AND SAFE TO RUN TWICE. `CREATE TABLE IF NOT
-- EXISTS`, information_schema guards on every column, index and foreign key,
-- and data steps that only touch workspaces with no activity results and
-- interactions with no `occurredAt` cover the re-run. The row counts before
-- and after are printed.
--
-- The same statements are also carried by mysql_upgrade_to_current.sql,
-- which is the file to run when bringing a database up to date generally.
-- This one exists for applying just this change on its own.
--
-- TAKE A BACKUP FIRST:
--   mysqldump -u USER -p --single-transaction --routines DBNAME > backup.sql

SELECT 'm2 activities' AS step, DATABASE() AS db, NOW() AS at;

CREATE TABLE IF NOT EXISTS `ActivityResult` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `nameSq` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(191) NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ActivityResult_tenantId_order_idx`(`tenantId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Interaction' AND COLUMN_NAME = 'occurredAt');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Interaction` ADD COLUMN `occurredAt` DATETIME(3) NULL', 'SELECT ''skip: Interaction.occurredAt'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Interaction' AND COLUMN_NAME = 'contactPersonId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Interaction` ADD COLUMN `contactPersonId` VARCHAR(191) NULL', 'SELECT ''skip: Interaction.contactPersonId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Interaction' AND COLUMN_NAME = 'dealId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Interaction` ADD COLUMN `dealId` VARCHAR(191) NULL', 'SELECT ''skip: Interaction.dealId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Interaction' AND COLUMN_NAME = 'resultId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Interaction` ADD COLUMN `resultId` VARCHAR(191) NULL', 'SELECT ''skip: Interaction.resultId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Interaction' AND COLUMN_NAME = 'clientFeedback');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Interaction` ADD COLUMN `clientFeedback` TEXT NULL', 'SELECT ''skip: Interaction.clientFeedback'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Interaction' AND COLUMN_NAME = 'nextAction');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Interaction` ADD COLUMN `nextAction` TEXT NULL', 'SELECT ''skip: Interaction.nextAction'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Interaction' AND COLUMN_NAME = 'updatedAt');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Interaction` ADD COLUMN `updatedAt` DATETIME(3) NULL', 'SELECT ''skip: Interaction.updatedAt'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Interaction' AND COLUMN_NAME = 'updatedByUserId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Interaction` ADD COLUMN `updatedByUserId` VARCHAR(191) NULL', 'SELECT ''skip: Interaction.updatedByUserId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Interaction' AND INDEX_NAME = 'Interaction_tenantId_clientId_occurredAt_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Interaction_tenantId_clientId_occurredAt_idx` ON `Interaction`(`tenantId`, `clientId`, `occurredAt`)', 'SELECT ''skip: Interaction_tenantId_clientId_occurredAt_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Interaction' AND INDEX_NAME = 'Interaction_tenantId_dealId_occurredAt_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Interaction_tenantId_dealId_occurredAt_idx` ON `Interaction`(`tenantId`, `dealId`, `occurredAt`)', 'SELECT ''skip: Interaction_tenantId_dealId_occurredAt_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Interaction' AND INDEX_NAME = 'Interaction_contactPersonId_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Interaction_contactPersonId_idx` ON `Interaction`(`contactPersonId`)', 'SELECT ''skip: Interaction_contactPersonId_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Interaction' AND INDEX_NAME = 'Interaction_dealId_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Interaction_dealId_idx` ON `Interaction`(`dealId`)', 'SELECT ''skip: Interaction_dealId_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Interaction' AND INDEX_NAME = 'Interaction_resultId_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Interaction_resultId_idx` ON `Interaction`(`resultId`)', 'SELECT ''skip: Interaction_resultId_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Interaction' AND INDEX_NAME = 'Interaction_updatedByUserId_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Interaction_updatedByUserId_idx` ON `Interaction`(`updatedByUserId`)', 'SELECT ''skip: Interaction_updatedByUserId_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=0;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Interaction' AND CONSTRAINT_NAME = 'Interaction_contactPersonId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Interaction` ADD CONSTRAINT `Interaction_contactPersonId_fkey` FOREIGN KEY (`contactPersonId`) REFERENCES `ContactPerson`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Interaction.Interaction_contactPersonId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Interaction' AND CONSTRAINT_NAME = 'Interaction_dealId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Interaction` ADD CONSTRAINT `Interaction_dealId_fkey` FOREIGN KEY (`dealId`) REFERENCES `Deal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Interaction.Interaction_dealId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Interaction' AND CONSTRAINT_NAME = 'Interaction_resultId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Interaction` ADD CONSTRAINT `Interaction_resultId_fkey` FOREIGN KEY (`resultId`) REFERENCES `ActivityResult`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Interaction.Interaction_resultId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Interaction' AND CONSTRAINT_NAME = 'Interaction_updatedByUserId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Interaction` ADD CONSTRAINT `Interaction_updatedByUserId_fkey` FOREIGN KEY (`updatedByUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Interaction.Interaction_updatedByUserId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ActivityResult' AND CONSTRAINT_NAME = 'ActivityResult_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `ActivityResult` ADD CONSTRAINT `ActivityResult_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: ActivityResult.ActivityResult_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET FOREIGN_KEY_CHECKS=1;

-- Data (FR-ACT-07, NFR-OPS-02), the same as the Postgres migration. Only
-- workspaces with no activity results yet get the list: the defaults from
-- src/lookups/domain/DefaultLookups.ts (Q14), then every legacy
-- OutcomeCategory label that is not already one of them. A copied category
-- keeps its id, so interactions map by key, not by label. A legacy row is one
-- with no `occurredAt`; it gets its result first and its date last.
SELECT 'before' AS m2_activities,
  (SELECT COUNT(*) FROM `Interaction`) AS interactions,
  (SELECT COUNT(*) FROM `Interaction` WHERE `occurredAt` IS NULL) AS without_occurred_at,
  (SELECT COUNT(*) FROM `OutcomeCategory`) AS outcome_categories,
  (SELECT COUNT(*) FROM `ActivityResult`) AS activity_results;

DROP TEMPORARY TABLE IF EXISTS `_m2_activities_tenant`;
CREATE TEMPORARY TABLE `_m2_activities_tenant` AS
SELECT t.id FROM `Tenant` t
WHERE NOT EXISTS (SELECT 1 FROM `ActivityResult` a WHERE a.tenantId = t.id);

INSERT INTO `ActivityResult` (`id`, `tenantId`, `nameSq`, `nameEn`, `order`, `updatedAt`)
SELECT UUID(), n.id, v.namesq, v.nameen, v.ord, NOW(3)
FROM `_m2_activities_tenant` n
CROSS JOIN (
  SELECT 'U kontaktua – i interesuar' AS namesq, 'Reached – interested' AS nameen, 1 AS ord
  UNION ALL
  SELECT 'U kontaktua – jo i interesuar', 'Reached – not interested', 2
  UNION ALL
  SELECT 'Nuk u kontaktua', 'Not reached', 3
  UNION ALL
  SELECT 'Telefono më vonë', 'Call back later', 4
  UNION ALL
  SELECT 'U caktua takim', 'Meeting agreed', 5
  UNION ALL
  SELECT 'Kërkoi ofertë', 'Offer requested', 6
) v;

INSERT INTO `ActivityResult` (`id`, `tenantId`, `nameSq`, `nameEn`, `order`, `updatedAt`)
SELECT o.id, o.tenantId, o.label, NULL,
       6 + ROW_NUMBER() OVER (PARTITION BY o.tenantId ORDER BY o.label), NOW(3)
FROM `OutcomeCategory` o
JOIN `_m2_activities_tenant` n ON n.id = o.tenantId
WHERE NOT EXISTS (SELECT 1 FROM `ActivityResult` a WHERE a.tenantId = o.tenantId AND a.nameSq = o.label)
  AND NOT EXISTS (SELECT 1 FROM `ActivityResult` a WHERE a.id = o.id);

UPDATE `Interaction` i
SET i.resultId = COALESCE(
  (SELECT a.id FROM `ActivityResult` a
    WHERE a.id = i.outcomeCategoryId AND a.tenantId = i.tenantId),
  (SELECT a.id FROM `ActivityResult` a
    JOIN `OutcomeCategory` o ON o.id = i.outcomeCategoryId
    WHERE a.tenantId = i.tenantId AND a.nameSq = o.label
    ORDER BY a.`order` LIMIT 1)
)
WHERE i.occurredAt IS NULL AND i.resultId IS NULL AND i.outcomeCategoryId IS NOT NULL;

UPDATE `Interaction` SET `occurredAt` = `createdAt` WHERE `occurredAt` IS NULL;

DROP TEMPORARY TABLE IF EXISTS `_m2_activities_tenant`;

SELECT 'after' AS m2_activities,
  (SELECT COUNT(*) FROM `Interaction`) AS interactions,
  (SELECT COUNT(*) FROM `Interaction` WHERE `occurredAt` IS NULL) AS without_occurred_at,
  (SELECT COUNT(*) FROM `Interaction` WHERE `resultId` IS NOT NULL) AS with_result,
  (SELECT COUNT(*) FROM `ActivityResult`) AS activity_results;

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20261002100000_m2_activities', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20261002100000_m2_activities'
);

SELECT 'm2 activities complete' AS step, NOW() AS at;
