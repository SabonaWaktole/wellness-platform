-- Wellness Albania — Milestone 3 KPI engine and Performance screen (M3 Slice 12)
-- on a live MySQL database.
--
-- Adds DealStageHistory.ownerUserId (the deal's owner when the change happened,
-- FR-PRF-05, D13) and Appointment.completedAt (when a follow-up was completed),
-- backfills them (history rows take the deal's current owner, completed
-- follow-ups take their last update), and adds the indexes the period queries use.
--
-- SAFE TO RUN ON PRODUCTION, AND SAFE TO RUN TWICE: every statement is guarded
-- by information_schema and the backfills touch only rows still NULL. The same
-- statements are also carried by mysql_upgrade_to_current.sql.
--
-- TAKE A BACKUP FIRST:
--   mysqldump -u USER -p --single-transaction --routines DBNAME > backup.sql

SELECT 'm3 performance indexes' AS step, DATABASE() AS db, NOW() AS at;

SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DealStageHistory' AND COLUMN_NAME = 'ownerUserId');
SET @sql := IF(@needed, 'ALTER TABLE `DealStageHistory` ADD COLUMN `ownerUserId` VARCHAR(191) NULL', 'SELECT ''skip: DealStageHistory.ownerUserId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Appointment' AND COLUMN_NAME = 'completedAt');
SET @sql := IF(@needed, 'ALTER TABLE `Appointment` ADD COLUMN `completedAt` DATETIME(3) NULL', 'SELECT ''skip: Appointment.completedAt'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill: only rows still NULL, so a second run changes nothing.
UPDATE `DealStageHistory` h JOIN `Deal` d ON d.`id` = h.`dealId` SET h.`ownerUserId` = d.`ownerUserId` WHERE h.`ownerUserId` IS NULL;
UPDATE `Appointment` SET `completedAt` = `updatedAt` WHERE `kind` = 'FOLLOW_UP' AND `status` = 'COMPLETED' AND `completedAt` IS NULL;

SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DealStageHistory' AND INDEX_NAME = 'DealStageHistory_tenantId_ownerUserId_toStage_at_idx');
SET @sql := IF(@needed, 'CREATE INDEX `DealStageHistory_tenantId_ownerUserId_toStage_at_idx` ON `DealStageHistory`(`tenantId`, `ownerUserId`, `toStage`, `at`)', 'SELECT ''skip: DealStageHistory_tenantId_ownerUserId_toStage_at_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Deal' AND INDEX_NAME = 'Deal_tenantId_wonAt_idx');
SET @sql := IF(@needed, 'CREATE INDEX `Deal_tenantId_wonAt_idx` ON `Deal`(`tenantId`, `wonAt`)', 'SELECT ''skip: Deal_tenantId_wonAt_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Deal' AND INDEX_NAME = 'Deal_tenantId_lostAt_idx');
SET @sql := IF(@needed, 'CREATE INDEX `Deal_tenantId_lostAt_idx` ON `Deal`(`tenantId`, `lostAt`)', 'SELECT ''skip: Deal_tenantId_lostAt_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Interaction' AND INDEX_NAME = 'Interaction_tenantId_authorUserId_occurredAt_idx');
SET @sql := IF(@needed, 'CREATE INDEX `Interaction_tenantId_authorUserId_occurredAt_idx` ON `Interaction`(`tenantId`, `authorUserId`, `occurredAt`)', 'SELECT ''skip: Interaction_tenantId_authorUserId_occurredAt_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND INDEX_NAME = 'Quotation_tenantId_sentAt_idx');
SET @sql := IF(@needed, 'CREATE INDEX `Quotation_tenantId_sentAt_idx` ON `Quotation`(`tenantId`, `sentAt`)', 'SELECT ''skip: Quotation_tenantId_sentAt_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND INDEX_NAME = 'Quotation_tenantId_createdByUserId_createdAt_idx');
SET @sql := IF(@needed, 'CREATE INDEX `Quotation_tenantId_createdByUserId_createdAt_idx` ON `Quotation`(`tenantId`, `createdByUserId`, `createdAt`)', 'SELECT ''skip: Quotation_tenantId_createdByUserId_createdAt_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Appointment' AND INDEX_NAME = 'Appointment_tenantId_completedAt_idx');
SET @sql := IF(@needed, 'CREATE INDEX `Appointment_tenantId_completedAt_idx` ON `Appointment`(`tenantId`, `completedAt`)', 'SELECT ''skip: Appointment_tenantId_completedAt_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20261016100000_m3_performance_indexes', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20261016100000_m3_performance_indexes'
);
