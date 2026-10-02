-- Wellness Albania — Milestone 2 sales script (M2 Slice 5) on a live MySQL
-- database.
--
-- Adds the SalesScript table, which keeps every published version of the
-- workspace sales script with its author and date, and seeds the placeholder
-- script, published as version 1, for every workspace (FR-SCR-03..06).
--
-- SAFE TO RUN ON PRODUCTION, AND SAFE TO RUN TWICE. `CREATE TABLE IF NOT
-- EXISTS`, information_schema guards on every foreign key, and
-- `WHERE NOT EXISTS (...)` on the seed cover the re-run: a workspace that
-- already has a script keeps it.
--
-- The same statements are also carried by mysql_upgrade_to_current.sql,
-- which is the file to run when bringing a database up to date generally.
-- This one exists for applying just this change on its own.
--
-- TAKE A BACKUP FIRST:
--   mysqldump -u USER -p --single-transaction --routines DBNAME > backup.sql

SELECT 'm2 sales script' AS step, DATABASE() AS db, NOW() AS at;

CREATE TABLE IF NOT EXISTS `SalesScript` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `liveSlot` VARCHAR(191) NULL,
    `contentSq` JSON NOT NULL,
    `contentEn` JSON NULL,
    `createdByUserId` VARCHAR(191) NULL,
    `publishedAt` DATETIME(3) NULL,
    `publishedByUserId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SalesScript_createdByUserId_idx`(`createdByUserId`),
    INDEX `SalesScript_publishedByUserId_idx`(`publishedByUserId`),
    UNIQUE INDEX `SalesScript_tenantId_version_key`(`tenantId`, `version`),
    UNIQUE INDEX `SalesScript_tenantId_liveSlot_key`(`tenantId`, `liveSlot`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=0;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SalesScript' AND CONSTRAINT_NAME = 'SalesScript_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `SalesScript` ADD CONSTRAINT `SalesScript_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: SalesScript.SalesScript_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SalesScript' AND CONSTRAINT_NAME = 'SalesScript_createdByUserId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `SalesScript` ADD CONSTRAINT `SalesScript_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT ''skip: SalesScript.SalesScript_createdByUserId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SalesScript' AND CONSTRAINT_NAME = 'SalesScript_publishedByUserId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `SalesScript` ADD CONSTRAINT `SalesScript_publishedByUserId_fkey` FOREIGN KEY (`publishedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT ''skip: SalesScript.SalesScript_publishedByUserId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET FOREIGN_KEY_CHECKS=1;

-- Seed: the placeholder script in src/salesScript/domain/DefaultSalesScript.ts,
-- published as version 1 for every workspace that has no script yet. Same
-- JSON as the Postgres migration.
INSERT INTO `SalesScript` (`id`, `tenantId`, `version`, `status`, `liveSlot`, `contentSq`, `contentEn`, `publishedAt`, `updatedAt`)
SELECT UUID(), t.id, 1, 'PUBLISHED', 'PUBLISHED',
    '{"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Hapja"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Prezantoni veten dhe Wellness Albania, dhe pyesni nëse është një moment i përshtatshëm për të folur."}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Zbulimi i nevojave"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Pyesni për aktivitetin e kompanisë, numrin e punonjësve dhe si e menaxhojnë sot sigurinë në punë."}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Pyetje për çmimin"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Konfirmoni numrin e punonjësve, llojin e biznesit, frekuencën e vizitave dhe qytetin para se të llogaritni çmimin."}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Kundërshtimet"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Dëgjoni kundërshtimin deri në fund, pastaj shpjegoni vlerën e shërbimit për kompaninë."}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Mbyllja"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Përmblidhni ofertën dhe bini dakord për hapin e radhës dhe datën e ndjekjes."}]}]}]}]}',
    '{"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Opening"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Introduce yourself and Wellness Albania, and ask whether this is a good moment to talk."}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Needs discovery"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Ask about the company activity, the number of employees and how they handle safety at work today."}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Pricing questions"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Confirm the number of employees, business type, visit frequency and city before calculating the price."}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Objections"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Hear the objection out, then explain the value of the service for the company."}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Closing"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Summarise the offer and agree the next step and the follow-up date."}]}]}]}]}',
    NOW(3), NOW(3)
FROM `Tenant` t
WHERE NOT EXISTS (SELECT 1 FROM `SalesScript` s WHERE s.tenantId = t.id);

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20261001120000_m2_sales_script', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20261001120000_m2_sales_script'
);

SELECT 'm2 sales script complete' AS step, NOW() AS at;
