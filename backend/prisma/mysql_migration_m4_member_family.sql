-- Wellness Albania — Milestone 4 family members (M4 Slice 6) on a live MySQL
-- database.
--
-- Adds MemberFamilyEvent (FR-FAM-06, FR-FAM-07), the history of family links and
-- removals. The table starts empty: no existing row is read or changed.
--
-- SAFE TO RUN ON PRODUCTION, AND SAFE TO RUN TWICE: the table is created only if
-- missing and the foreign key is guarded by information_schema.
--
-- The same statements are also carried by mysql_upgrade_to_current.sql, which
-- brings any older database straight to the current schema.

CREATE TABLE IF NOT EXISTS `MemberFamilyEvent` (
    `id` VARCHAR(191) NOT NULL,
    `memberId` VARCHAR(191) NOT NULL,
    `principalMemberId` VARCHAR(191) NULL,
    `relationshipId` VARCHAR(191) NULL,
    `kind` VARCHAR(191) NOT NULL,
    `reason` TEXT NULL,
    `byUserId` VARCHAR(191) NOT NULL,
    `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MemberFamilyEvent_memberId_at_idx`(`memberId`, `at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'MemberFamilyEvent' AND CONSTRAINT_NAME = 'MemberFamilyEvent_memberId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed, 'ALTER TABLE `MemberFamilyEvent` ADD CONSTRAINT `MemberFamilyEvent_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: MemberFamilyEvent_memberId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20261021100000_m4_member_family', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20261021100000_m4_member_family'
);
