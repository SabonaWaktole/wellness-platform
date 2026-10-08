-- Wellness Albania — Milestone 4 VIP requests (M4 Slice 7) on a live MySQL
-- database.
--
-- Adds VipRequest (FR-VIP-01..05). The table starts empty: no existing row is
-- read or changed. MySQL has no partial unique index, so "one open request per
-- member" (NFR-DAT-02) is kept by the use case, which takes the member's row lock
-- and checks inside the transaction.
--
-- SAFE TO RUN ON PRODUCTION, AND SAFE TO RUN TWICE: the table is created only if
-- missing and the foreign key is guarded by information_schema.
--
-- The same statements are also carried by mysql_upgrade_to_current.sql, which
-- brings any older database straight to the current schema.

CREATE TABLE IF NOT EXISTS `VipRequest` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `memberId` VARCHAR(191) NOT NULL,
    `requestedBy` VARCHAR(191) NOT NULL,
    `reason` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `decidedBy` VARCHAR(191) NULL,
    `decidedAt` DATETIME(3) NULL,
    `decisionNote` TEXT NULL,
    `reviewNotifiedAt` DATETIME(3) NULL,
    `endedAt` DATETIME(3) NULL,
    `endedBy` VARCHAR(191) NULL,
    `endReason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `VipRequest_tenantId_status_createdAt_idx`(`tenantId`, `status`, `createdAt`),
    INDEX `VipRequest_memberId_createdAt_idx`(`memberId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'VipRequest' AND CONSTRAINT_NAME = 'VipRequest_memberId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed, 'ALTER TABLE `VipRequest` ADD CONSTRAINT `VipRequest_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: VipRequest_memberId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20261022100000_m4_vip_requests', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20261022100000_m4_vip_requests'
);
