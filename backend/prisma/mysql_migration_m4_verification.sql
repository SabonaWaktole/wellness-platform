-- Wellness Albania — Milestone 4 verification (M4 Slice 13) on a live MySQL database.
--
-- Adds VerificationEvent (one row per check of a member card by Reception or a
-- partner clinic, FR-VER-06). The table starts empty: no existing row is read or
-- changed.
--
-- SAFE TO RUN ON PRODUCTION, AND SAFE TO RUN TWICE: the table is created only if
-- missing and the foreign keys are guarded by information_schema.
--
-- The same statements are also carried by mysql_upgrade_to_current.sql, which
-- brings any older database straight to the current schema.

CREATE TABLE IF NOT EXISTS `VerificationEvent` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `memberId` VARCHAR(191) NULL,
    `channel` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `result` VARCHAR(191) NOT NULL,
    `identityChoice` VARCHAR(191) NOT NULL DEFAULT 'NONE',
    `ipHash` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `VerificationEvent_tenantId_memberId_createdAt_idx`(`tenantId`, `memberId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'VerificationEvent' AND CONSTRAINT_NAME = 'VerificationEvent_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed, 'ALTER TABLE `VerificationEvent` ADD CONSTRAINT `VerificationEvent_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: VerificationEvent_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'VerificationEvent' AND CONSTRAINT_NAME = 'VerificationEvent_memberId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed, 'ALTER TABLE `VerificationEvent` ADD CONSTRAINT `VerificationEvent_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: VerificationEvent_memberId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20261026100000_m4_verification', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20261026100000_m4_verification'
);
