-- Wellness Albania — Milestone 4 member record (M4 Slice 4) on a live MySQL
-- database.
--
-- Adds Member, MemberTerm, MemberTierHistory and MemberStatusHistory
-- (FR-MEM-02, FR-TIR-08, FR-MEM-05). The tables start empty: no existing row is
-- read or changed. No column holds medical data, an address, a photograph or a
-- national ID (FR-DPR-01, FR-DPR-03).
--
-- SAFE TO RUN ON PRODUCTION, AND SAFE TO RUN TWICE: tables are created only if
-- missing and every foreign key is guarded by information_schema.
--
-- The same statements are also carried by mysql_upgrade_to_current.sql, which
-- is the file to run when bringing a database up to date generally.
--
-- TAKE A BACKUP FIRST:
--   mysqldump -u USER -p --single-transaction --routines DBNAME > backup.sql

SELECT 'm4 members' AS step, DATABASE() AS db, NOW() AS at;

CREATE TABLE IF NOT EXISTS `Member` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `memberNumber` VARCHAR(191) NOT NULL,
    `firstName` VARCHAR(191) NOT NULL,
    `lastName` VARCHAR(191) NOT NULL,
    `dateOfBirth` DATE NULL,
    `phone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `language` VARCHAR(191) NOT NULL DEFAULT 'sq',
    `cityId` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `currentTier` VARCHAR(191) NOT NULL DEFAULT 'BRONZE',
    `startsOn` DATE NOT NULL,
    `employerClientId` VARCHAR(191) NULL,
    `formerEmployerClientId` VARCHAR(191) NULL,
    `leftCompanyAt` DATE NULL,
    `principalMemberId` VARCHAR(191) NULL,
    `relationshipId` VARCHAR(191) NULL,
    `relationshipConfirmedBy` VARCHAR(191) NULL,
    `relationshipConfirmedAt` DATETIME(3) NULL,
    `cardToken` VARCHAR(191) NOT NULL,
    `note` TEXT NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `closedAt` DATETIME(3) NULL,
    `anonymisedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Member_cardToken_key`(`cardToken`),
    INDEX `Member_tenantId_lastName_firstName_idx`(`tenantId`, `lastName`, `firstName`),
    INDEX `Member_tenantId_currentTier_status_idx`(`tenantId`, `currentTier`, `status`),
    INDEX `Member_tenantId_employerClientId_idx`(`tenantId`, `employerClientId`),
    INDEX `Member_tenantId_email_idx`(`tenantId`, `email`),
    INDEX `Member_tenantId_phone_idx`(`tenantId`, `phone`),
    INDEX `Member_tenantId_dateOfBirth_idx`(`tenantId`, `dateOfBirth`),
    INDEX `Member_principalMemberId_idx`(`principalMemberId`),
    UNIQUE INDEX `Member_tenantId_memberNumber_key`(`tenantId`, `memberNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `MemberTerm` (
    `id` VARCHAR(191) NOT NULL,
    `memberId` VARCHAR(191) NOT NULL,
    `tier` VARCHAR(191) NOT NULL,
    `source` VARCHAR(191) NOT NULL,
    `startsOn` DATE NOT NULL,
    `endsOn` DATE NULL,
    `paymentId` VARCHAR(191) NULL,
    `followsTermId` VARCHAR(191) NULL,
    `closedEarlyByPaymentId` VARCHAR(191) NULL,
    `originalEndsOn` DATE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `MemberTerm_followsTermId_key`(`followsTermId`),
    INDEX `MemberTerm_memberId_startsOn_idx`(`memberId`, `startsOn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `MemberTierHistory` (
    `id` VARCHAR(191) NOT NULL,
    `memberId` VARCHAR(191) NOT NULL,
    `fromTier` VARCHAR(191) NOT NULL,
    `toTier` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `comment` TEXT NULL,
    `changedByUserId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MemberTierHistory_memberId_createdAt_idx`(`memberId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `MemberStatusHistory` (
    `id` VARCHAR(191) NOT NULL,
    `memberId` VARCHAR(191) NOT NULL,
    `fromStatus` VARCHAR(191) NULL,
    `toStatus` VARCHAR(191) NOT NULL,
    `reason` TEXT NULL,
    `changedByUserId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MemberStatusHistory_memberId_createdAt_idx`(`memberId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Member' AND CONSTRAINT_NAME = 'Member_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed, 'ALTER TABLE `Member` ADD CONSTRAINT `Member_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: Member_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Member' AND CONSTRAINT_NAME = 'Member_cityId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed, 'ALTER TABLE `Member` ADD CONSTRAINT `Member_cityId_fkey` FOREIGN KEY (`cityId`) REFERENCES `City`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Member_cityId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Member' AND CONSTRAINT_NAME = 'Member_employerClientId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed, 'ALTER TABLE `Member` ADD CONSTRAINT `Member_employerClientId_fkey` FOREIGN KEY (`employerClientId`) REFERENCES `Client`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Member_employerClientId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Member' AND CONSTRAINT_NAME = 'Member_formerEmployerClientId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed, 'ALTER TABLE `Member` ADD CONSTRAINT `Member_formerEmployerClientId_fkey` FOREIGN KEY (`formerEmployerClientId`) REFERENCES `Client`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Member_formerEmployerClientId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Member' AND CONSTRAINT_NAME = 'Member_principalMemberId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed, 'ALTER TABLE `Member` ADD CONSTRAINT `Member_principalMemberId_fkey` FOREIGN KEY (`principalMemberId`) REFERENCES `Member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Member_principalMemberId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Member' AND CONSTRAINT_NAME = 'Member_relationshipId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed, 'ALTER TABLE `Member` ADD CONSTRAINT `Member_relationshipId_fkey` FOREIGN KEY (`relationshipId`) REFERENCES `FamilyRelationship`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Member_relationshipId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'MemberTerm' AND CONSTRAINT_NAME = 'MemberTerm_memberId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed, 'ALTER TABLE `MemberTerm` ADD CONSTRAINT `MemberTerm_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: MemberTerm_memberId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'MemberTierHistory' AND CONSTRAINT_NAME = 'MemberTierHistory_memberId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed, 'ALTER TABLE `MemberTierHistory` ADD CONSTRAINT `MemberTierHistory_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: MemberTierHistory_memberId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'MemberStatusHistory' AND CONSTRAINT_NAME = 'MemberStatusHistory_memberId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed, 'ALTER TABLE `MemberStatusHistory` ADD CONSTRAINT `MemberStatusHistory_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: MemberStatusHistory_memberId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20261019100000_m4_members', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20261019100000_m4_members'
);
