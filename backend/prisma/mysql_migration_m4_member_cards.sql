-- Wellness Albania — Milestone 4 digital member card (M4 Slice 11) on a live MySQL
-- database.
--
-- Adds MemberCardToken (the hash of a replaced card token, FR-CRD-10) and
-- EmployeeImport.memberIds. The table starts empty: no existing row is read or
-- changed.
--
-- SAFE TO RUN ON PRODUCTION, AND SAFE TO RUN TWICE: the column and table are
-- created only if missing and the foreign key is guarded by information_schema.
--
-- The same statements are also carried by mysql_upgrade_to_current.sql, which
-- brings any older database straight to the current schema.

SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'EmployeeImport' AND COLUMN_NAME = 'memberIds');
SET @sql := IF(@needed, 'ALTER TABLE `EmployeeImport` ADD COLUMN `memberIds` JSON NULL', 'SELECT ''skip: EmployeeImport.memberIds'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `MemberCardToken` (
    `id` VARCHAR(191) NOT NULL,
    `memberId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `replacedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `MemberCardToken_tokenHash_key`(`tokenHash`),
    INDEX `MemberCardToken_memberId_idx`(`memberId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'MemberCardToken' AND CONSTRAINT_NAME = 'MemberCardToken_memberId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed, 'ALTER TABLE `MemberCardToken` ADD CONSTRAINT `MemberCardToken_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: MemberCardToken_memberId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20261025100000_m4_member_cards', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20261025100000_m4_member_cards'
);
