-- Wellness Albania — Milestone 4 membership payments (M4 Slice 5) on a live
-- MySQL database.
--
-- Adds MemberPayment (FR-MPAY-01..11, NFR-ACC-05): money as DECIMAL(12,2), the
-- discount as DECIMAL(7,2). The table starts empty: no existing row is read or
-- changed.
--
-- SAFE TO RUN ON PRODUCTION, AND SAFE TO RUN TWICE: the table is created only if
-- missing and the foreign key is guarded by information_schema.
--
-- The same statements are also carried by mysql_upgrade_to_current.sql, which
-- brings any older database straight to the current schema.

CREATE TABLE IF NOT EXISTS `MemberPayment` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `memberId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `fromTier` VARCHAR(191) NOT NULL,
    `toTier` VARCHAR(191) NOT NULL,
    `listFee` DECIMAL(12, 2) NOT NULL,
    `discountPercent` DECIMAL(7, 2) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `method` VARCHAR(191) NOT NULL,
    `receivedOn` DATE NOT NULL,
    `receiptNumber` VARCHAR(191) NOT NULL,
    `note` TEXT NULL,
    `recordedBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `voidedAt` DATETIME(3) NULL,
    `voidedBy` VARCHAR(191) NULL,
    `voidReason` TEXT NULL,

    UNIQUE INDEX `MemberPayment_tenantId_receiptNumber_key`(`tenantId`, `receiptNumber`),
    INDEX `MemberPayment_tenantId_receivedOn_idx`(`tenantId`, `receivedOn`),
    INDEX `MemberPayment_memberId_createdAt_idx`(`memberId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'MemberPayment' AND CONSTRAINT_NAME = 'MemberPayment_memberId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed, 'ALTER TABLE `MemberPayment` ADD CONSTRAINT `MemberPayment_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: MemberPayment_memberId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20261020100000_m4_member_payments', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20261020100000_m4_member_payments'
);
