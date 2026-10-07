-- Wellness Albania — Milestone 4 corporate employee upload (M4 Slice 9) on a live
-- MySQL database.
--
-- Adds EmployeeImport (FR-EMP-01..07). The table starts empty: no existing row is
-- read or changed.
--
-- SAFE TO RUN ON PRODUCTION, AND SAFE TO RUN TWICE: the table is created only if
-- missing and the foreign keys are guarded by information_schema.
--
-- The same statements are also carried by mysql_upgrade_to_current.sql, which
-- brings any older database straight to the current schema.

CREATE TABLE IF NOT EXISTS `EmployeeImport` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `uploadedBy` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PREVIEWED',
    `rows` JSON NULL,
    `result` JSON NULL,
    `confirmToken` VARCHAR(191) NOT NULL,
    `created` INTEGER NOT NULL DEFAULT 0,
    `linked` INTEGER NOT NULL DEFAULT 0,
    `skipped` INTEGER NOT NULL DEFAULT 0,
    `refused` INTEGER NOT NULL DEFAULT 0,
    `errors` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `confirmedAt` DATETIME(3) NULL,

    INDEX `EmployeeImport_tenantId_clientId_createdAt_idx`(`tenantId`, `clientId`, `createdAt`),
    INDEX `EmployeeImport_tenantId_status_createdAt_idx`(`tenantId`, `status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'EmployeeImport' AND CONSTRAINT_NAME = 'EmployeeImport_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed, 'ALTER TABLE `EmployeeImport` ADD CONSTRAINT `EmployeeImport_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: EmployeeImport_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'EmployeeImport' AND CONSTRAINT_NAME = 'EmployeeImport_clientId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed, 'ALTER TABLE `EmployeeImport` ADD CONSTRAINT `EmployeeImport_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: EmployeeImport_clientId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20261024100000_m4_employee_imports', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20261024100000_m4_employee_imports'
);
