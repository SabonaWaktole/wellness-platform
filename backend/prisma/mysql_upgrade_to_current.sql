-- NevaCRM — bring a live MySQL database up to the current schema.
--
-- SAFE TO RUN ON PRODUCTION, AND SAFE TO RUN TWICE. Every statement is guarded
-- against information_schema, so this does the same thing whether the database
-- is at the original Hostinger baseline, part-way through the earlier
-- hand-written migrations, or already fully up to date: it adds only what is
-- missing and reports what it skipped.
--
-- WHAT IT DOES NOT DO: it never drops a table, column or index, never retypes a
-- column in a way that discards values, and rewrites existing rows in exactly
-- two places, both conditional and both additive:
--   * Tenant.clientFieldsSeededAt  — stamped only where it is NULL and the
--                                    tenant already has role-carrying fields;
--   * ClientForm.settings          — set to '{}' only where it is NULL, so the
--                                    column can become NOT NULL.
--
-- It replaces running these five by hand, in this order (the order matters —
-- the 2026-08-27 file reads CustomFieldDefinition.role, which the role/order
-- file adds):
--   1. mysql_migration_add_custom_field_role_order.sql
--   2. mysql_production_migration_2026_08_27.sql
--   3. mysql_migration_add_client_forms.sql
--   4. mysql_migration_add_form_versions_and_submissions.sql
--   5. mysql_migration_add_published_at_draft_version.sql
--   6. mysql_migration_add_contracts.sql
--
-- TAKE A BACKUP FIRST. Nothing here is designed to lose data, but a backup is
-- what makes that a fact rather than an intention:
--   mysqldump -u USER -p --single-transaction --routines DBNAME > backup.sql

SELECT 'starting upgrade' AS step, DATABASE() AS db, NOW() AS at;


-- ---------------------------------------------------------------
-- 1. Client fields become optional; custom fields gain role/order
-- ---------------------------------------------------------------

-- Client.name -> NULL
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Client' AND COLUMN_NAME = 'name' AND IS_NULLABLE = 'YES');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Client` MODIFY COLUMN `name` VARCHAR(191) NULL', 'SELECT ''skip: Client.name -> NULL'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- Client.status -> NULL
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Client' AND COLUMN_NAME = 'status' AND IS_NULLABLE = 'YES');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Client` MODIFY COLUMN `status` VARCHAR(191) NULL', 'SELECT ''skip: Client.status -> NULL'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- CustomFieldDefinition.order
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'CustomFieldDefinition' AND COLUMN_NAME = 'order');
SET @sql := IF(@needed = 0, 'ALTER TABLE `CustomFieldDefinition` ADD COLUMN `order` INT NOT NULL DEFAULT 0', 'SELECT ''skip: CustomFieldDefinition.order'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- CustomFieldDefinition.required
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'CustomFieldDefinition' AND COLUMN_NAME = 'required');
SET @sql := IF(@needed = 0, 'ALTER TABLE `CustomFieldDefinition` ADD COLUMN `required` BOOLEAN NOT NULL DEFAULT false', 'SELECT ''skip: CustomFieldDefinition.required'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- CustomFieldDefinition.role
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'CustomFieldDefinition' AND COLUMN_NAME = 'role');
SET @sql := IF(@needed = 0, 'ALTER TABLE `CustomFieldDefinition` ADD COLUMN `role` VARCHAR(191) NULL', 'SELECT ''skip: CustomFieldDefinition.role'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- CustomFieldDefinition.CustomFieldDefinition_tenantId_role_key
SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'CustomFieldDefinition' AND INDEX_NAME = 'CustomFieldDefinition_tenantId_role_key');
SET @sql := IF(@needed = 0, 'CREATE UNIQUE INDEX `CustomFieldDefinition_tenantId_role_key` ON `CustomFieldDefinition`(`tenantId`, `role`)', 'SELECT ''skip: CustomFieldDefinition.CustomFieldDefinition_tenantId_role_key'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ---------------------------------------------------------------
-- 2. Client archiving, notes, and the seeded-fields stamp
-- ---------------------------------------------------------------

-- Tenant.clientFieldsSeededAt
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Tenant' AND COLUMN_NAME = 'clientFieldsSeededAt');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Tenant` ADD COLUMN `clientFieldsSeededAt` DATETIME(3) NULL', 'SELECT ''skip: Tenant.clientFieldsSeededAt'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- Client.deletedAt
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Client' AND COLUMN_NAME = 'deletedAt');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Client` ADD COLUMN `deletedAt` DATETIME(3) NULL', 'SELECT ''skip: Client.deletedAt'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- Client.notes
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Client' AND COLUMN_NAME = 'notes');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Client` ADD COLUMN `notes` TEXT NULL', 'SELECT ''skip: Client.notes'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- Client.Client_tenantId_deletedAt_idx
SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Client' AND INDEX_NAME = 'Client_tenantId_deletedAt_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Client_tenantId_deletedAt_idx` ON `Client`(`tenantId`, `deletedAt`)', 'SELECT ''skip: Client.Client_tenantId_deletedAt_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- Backfill: a tenant that already has role-carrying fields has been seeded, so
-- the stamp records that rather than letting the app seed them a second time.
-- Conditional on IS NULL, so running this again changes nothing.
UPDATE `Tenant` t
SET t.`clientFieldsSeededAt` = NOW(3)
WHERE t.`clientFieldsSeededAt` IS NULL
  AND EXISTS (SELECT 1 FROM `CustomFieldDefinition` c
              WHERE c.`tenantId` = t.`id` AND c.`role` IS NOT NULL);


-- ---------------------------------------------------------------
-- 3. Client forms
-- ---------------------------------------------------------------

-- Tenant.clientFormSeededAt
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Tenant' AND COLUMN_NAME = 'clientFormSeededAt');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Tenant` ADD COLUMN `clientFormSeededAt` DATETIME(3) NULL', 'SELECT ''skip: Tenant.clientFormSeededAt'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- Created with its FINAL shape, so a database that has never seen a form needs
-- none of the column guards below. Those exist for one that got the earlier,
-- narrower version of this table.
CREATE TABLE IF NOT EXISTS `ClientForm` (
  `id`                      VARCHAR(191) NOT NULL,
  `tenantId`                VARCHAR(191) NOT NULL,
  `name`                    VARCHAR(191) NOT NULL,
  `description`             TEXT NULL,
  `isDefault`               BOOLEAN NOT NULL DEFAULT false,
  `status`                  VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
  `layout`                  JSON NOT NULL,
  `version`                 INT NOT NULL DEFAULT 1,
  `createdAt`               DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`               DATETIME(3) NOT NULL,
  `deletedAt`               DATETIME(3) NULL,
  `shareToken`              VARCHAR(191) NULL,
  `isTemplate`              BOOLEAN NOT NULL DEFAULT false,
  `publishedVersionId`      VARCHAR(191) NULL,
  `publishedAtDraftVersion` INT NULL,
  `settings`                JSON NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


-- ClientForm.shareToken
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ClientForm' AND COLUMN_NAME = 'shareToken');
SET @sql := IF(@needed = 0, 'ALTER TABLE `ClientForm` ADD COLUMN `shareToken` VARCHAR(191) NULL', 'SELECT ''skip: ClientForm.shareToken'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ClientForm.isTemplate
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ClientForm' AND COLUMN_NAME = 'isTemplate');
SET @sql := IF(@needed = 0, 'ALTER TABLE `ClientForm` ADD COLUMN `isTemplate` BOOLEAN NOT NULL DEFAULT false', 'SELECT ''skip: ClientForm.isTemplate'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ClientForm.publishedVersionId
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ClientForm' AND COLUMN_NAME = 'publishedVersionId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `ClientForm` ADD COLUMN `publishedVersionId` VARCHAR(191) NULL', 'SELECT ''skip: ClientForm.publishedVersionId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ClientForm.publishedAtDraftVersion
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ClientForm' AND COLUMN_NAME = 'publishedAtDraftVersion');
SET @sql := IF(@needed = 0, 'ALTER TABLE `ClientForm` ADD COLUMN `publishedAtDraftVersion` INT NULL', 'SELECT ''skip: ClientForm.publishedAtDraftVersion'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ClientForm.settings
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ClientForm' AND COLUMN_NAME = 'settings');
SET @sql := IF(@needed = 0, 'ALTER TABLE `ClientForm` ADD COLUMN `settings` JSON NULL', 'SELECT ''skip: ClientForm.settings'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- `settings` arrives nullable so the column can be added to a table that already
-- has rows; every row is given an empty object and only then is it made NOT
-- NULL, which is what the schema declares.
UPDATE `ClientForm` SET `settings` = JSON_OBJECT() WHERE `settings` IS NULL;


-- ClientForm.settings -> NOT NULL
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ClientForm' AND COLUMN_NAME = 'settings' AND IS_NULLABLE = 'NO');
SET @sql := IF(@needed = 0, 'ALTER TABLE `ClientForm` MODIFY COLUMN `settings` JSON NOT NULL', 'SELECT ''skip: ClientForm.settings -> NOT NULL'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ClientForm.ClientForm_tenantId_name_key
SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ClientForm' AND INDEX_NAME = 'ClientForm_tenantId_name_key');
SET @sql := IF(@needed = 0, 'CREATE UNIQUE INDEX `ClientForm_tenantId_name_key` ON `ClientForm`(`tenantId`, `name`)', 'SELECT ''skip: ClientForm.ClientForm_tenantId_name_key'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ClientForm.ClientForm_tenantId_deletedAt_idx
SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ClientForm' AND INDEX_NAME = 'ClientForm_tenantId_deletedAt_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `ClientForm_tenantId_deletedAt_idx` ON `ClientForm`(`tenantId`, `deletedAt`)', 'SELECT ''skip: ClientForm.ClientForm_tenantId_deletedAt_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ClientForm.ClientForm_shareToken_key
SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ClientForm' AND INDEX_NAME = 'ClientForm_shareToken_key');
SET @sql := IF(@needed = 0, 'CREATE UNIQUE INDEX `ClientForm_shareToken_key` ON `ClientForm`(`shareToken`)', 'SELECT ''skip: ClientForm.ClientForm_shareToken_key'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ClientForm.ClientForm_tenantId_fkey
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ClientForm' AND CONSTRAINT_NAME = 'ClientForm_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `ClientForm` ADD CONSTRAINT `ClientForm_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: ClientForm.ClientForm_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ---------------------------------------------------------------
-- 4. Published versions and submissions
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `FormVersion` (
  `id`                VARCHAR(191) NOT NULL,
  `tenantId`          VARCHAR(191) NOT NULL,
  `formId`            VARCHAR(191) NOT NULL,
  `versionNumber`     INT NOT NULL,
  `document`          JSON NOT NULL,
  `publishedAt`       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `publishedByUserId` VARCHAR(191) NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `FormSubmission` (
  `id`                VARCHAR(191) NOT NULL,
  `tenantId`          VARCHAR(191) NOT NULL,
  `formId`            VARCHAR(191) NOT NULL,
  `formVersionId`     VARCHAR(191) NOT NULL,
  `data`              JSON NOT NULL,
  `submittedAt`       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `submittedByUserId` VARCHAR(191) NULL,
  `clientId`          VARCHAR(191) NULL,
  `source`            VARCHAR(191) NOT NULL DEFAULT 'PUBLIC_LINK',
  `ipHash`            VARCHAR(191) NULL,
  `userAgent`         TEXT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


-- FormVersion.FormVersion_formId_versionNumber_key
SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'FormVersion' AND INDEX_NAME = 'FormVersion_formId_versionNumber_key');
SET @sql := IF(@needed = 0, 'CREATE UNIQUE INDEX `FormVersion_formId_versionNumber_key` ON `FormVersion`(`formId`, `versionNumber`)', 'SELECT ''skip: FormVersion.FormVersion_formId_versionNumber_key'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- FormVersion.FormVersion_tenantId_formId_idx
SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'FormVersion' AND INDEX_NAME = 'FormVersion_tenantId_formId_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `FormVersion_tenantId_formId_idx` ON `FormVersion`(`tenantId`, `formId`)', 'SELECT ''skip: FormVersion.FormVersion_tenantId_formId_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- FormSubmission.FormSubmission_tenantId_formId_submittedAt_idx
SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'FormSubmission' AND INDEX_NAME = 'FormSubmission_tenantId_formId_submittedAt_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `FormSubmission_tenantId_formId_submittedAt_idx` ON `FormSubmission`(`tenantId`, `formId`, `submittedAt`)', 'SELECT ''skip: FormSubmission.FormSubmission_tenantId_formId_submittedAt_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- FormSubmission.FormSubmission_tenantId_submittedAt_idx
SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'FormSubmission' AND INDEX_NAME = 'FormSubmission_tenantId_submittedAt_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `FormSubmission_tenantId_submittedAt_idx` ON `FormSubmission`(`tenantId`, `submittedAt`)', 'SELECT ''skip: FormSubmission.FormSubmission_tenantId_submittedAt_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- FormVersion.FormVersion_tenantId_fkey
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'FormVersion' AND CONSTRAINT_NAME = 'FormVersion_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `FormVersion` ADD CONSTRAINT `FormVersion_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: FormVersion.FormVersion_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- FormVersion.FormVersion_formId_fkey
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'FormVersion' AND CONSTRAINT_NAME = 'FormVersion_formId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `FormVersion` ADD CONSTRAINT `FormVersion_formId_fkey` FOREIGN KEY (`formId`) REFERENCES `ClientForm`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: FormVersion.FormVersion_formId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- FormSubmission.FormSubmission_tenantId_fkey
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'FormSubmission' AND CONSTRAINT_NAME = 'FormSubmission_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `FormSubmission` ADD CONSTRAINT `FormSubmission_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: FormSubmission.FormSubmission_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- FormSubmission.FormSubmission_formId_fkey
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'FormSubmission' AND CONSTRAINT_NAME = 'FormSubmission_formId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `FormSubmission` ADD CONSTRAINT `FormSubmission_formId_fkey` FOREIGN KEY (`formId`) REFERENCES `ClientForm`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: FormSubmission.FormSubmission_formId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- FormSubmission.FormSubmission_formVersionId_fkey
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'FormSubmission' AND CONSTRAINT_NAME = 'FormSubmission_formVersionId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `FormSubmission` ADD CONSTRAINT `FormSubmission_formVersionId_fkey` FOREIGN KEY (`formVersionId`) REFERENCES `FormVersion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: FormSubmission.FormSubmission_formVersionId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ---------------------------------------------------------------
-- Report: every item this script is responsible for, and its state.

-- ---------------------------------------------------------------
-- 6. Contracts module
--
-- Subscriptions a workspace has sold to its own clients, with a per-instalment
-- payment schedule someone marks paid by hand. Purely additive: three new
-- tables, no change to anything that already exists.
-- ---------------------------------------------------------------
SELECT 'contracts module' AS step, NOW() AS at;

-- ---------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `Contract` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `assignedUserId` VARCHAR(191) NULL,
    `planName` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `billingPeriod` VARCHAR(191) NOT NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NOT NULL,
    `notes` TEXT NULL,
    `documentUrl` TEXT NULL,
    `documentName` TEXT NULL,
    `renewedFromContractId` VARCHAR(191) NULL,
    `activatedAt` DATETIME(3) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `expiryNotifiedAt` DATETIME(3) NULL,
    `createdByUserId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Contract_renewedFromContractId_key`(`renewedFromContractId`),
    INDEX `Contract_tenantId_clientId_idx`(`tenantId`, `clientId`),
    INDEX `Contract_tenantId_status_idx`(`tenantId`, `status`),
    INDEX `Contract_tenantId_assignedUserId_idx`(`tenantId`, `assignedUserId`),
    INDEX `Contract_status_endsAt_idx`(`status`, `endsAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ContractPayment` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `contractId` VARCHAR(191) NOT NULL,
    `periodIndex` INTEGER NOT NULL,
    `dueDate` DATETIME(3) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'UNPAID',
    `paidAmount` DOUBLE NOT NULL DEFAULT 0,
    `paidAt` DATETIME(3) NULL,
    `method` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ContractPayment_tenantId_contractId_dueDate_idx`(`tenantId`, `contractId`, `dueDate`),
    INDEX `ContractPayment_tenantId_status_dueDate_idx`(`tenantId`, `status`, `dueDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ContractStatusHistory` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `contractId` VARCHAR(191) NOT NULL,
    `fromStatus` VARCHAR(191) NOT NULL,
    `toStatus` VARCHAR(191) NOT NULL,
    `changedByUserId` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ContractStatusHistory_tenantId_contractId_idx`(`tenantId`, `contractId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- Foreign keys, each added only if it is not already there.
-- ---------------------------------------------------------------

-- Contract.Contract_tenantId_fkey
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND CONSTRAINT_NAME = 'Contract_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD CONSTRAINT `Contract_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Contract.Contract_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Contract.Contract_clientId_fkey
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND CONSTRAINT_NAME = 'Contract_clientId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD CONSTRAINT `Contract_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Contract.Contract_clientId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Contract.Contract_assignedUserId_fkey
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND CONSTRAINT_NAME = 'Contract_assignedUserId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD CONSTRAINT `Contract_assignedUserId_fkey` FOREIGN KEY (`assignedUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Contract.Contract_assignedUserId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Contract.Contract_createdByUserId_fkey
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND CONSTRAINT_NAME = 'Contract_createdByUserId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD CONSTRAINT `Contract_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Contract.Contract_createdByUserId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Contract.Contract_renewedFromContractId_fkey
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND CONSTRAINT_NAME = 'Contract_renewedFromContractId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD CONSTRAINT `Contract_renewedFromContractId_fkey` FOREIGN KEY (`renewedFromContractId`) REFERENCES `Contract`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Contract.Contract_renewedFromContractId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ContractPayment.ContractPayment_contractId_fkey
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ContractPayment' AND CONSTRAINT_NAME = 'ContractPayment_contractId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `ContractPayment` ADD CONSTRAINT `ContractPayment_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `Contract`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: ContractPayment.ContractPayment_contractId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ContractStatusHistory.ContractStatusHistory_contractId_fkey
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ContractStatusHistory' AND CONSTRAINT_NAME = 'ContractStatusHistory_contractId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `ContractStatusHistory` ADD CONSTRAINT `ContractStatusHistory_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `Contract`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: ContractStatusHistory.ContractStatusHistory_contractId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ContractStatusHistory.ContractStatusHistory_changedByUserId_fkey
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ContractStatusHistory' AND CONSTRAINT_NAME = 'ContractStatusHistory_changedByUserId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `ContractStatusHistory` ADD CONSTRAINT `ContractStatusHistory_changedByUserId_fkey` FOREIGN KEY (`changedByUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: ContractStatusHistory.ContractStatusHistory_changedByUserId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=1;

-- ---------------------------------------------------------------
-- Migration-history bookkeeping, so a later `prisma migrate deploy`
-- recognises this work as already applied rather than trying to redo it.
-- ---------------------------------------------------------------
INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20260914173610_add_contracts', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20260914173610_add_contracts'
);

-- ---------------------------------------------------------------
SELECT item, IF(present > 0, 'OK', 'STILL MISSING') AS state FROM (
  SELECT 'Client.deletedAt' AS item, COUNT(*) AS present FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Client' AND COLUMN_NAME='deletedAt'
  UNION ALL SELECT 'Client.notes', COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Client' AND COLUMN_NAME='notes'
  UNION ALL SELECT 'CustomFieldDefinition.role', COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='CustomFieldDefinition' AND COLUMN_NAME='role'
  UNION ALL SELECT 'Tenant.clientFieldsSeededAt', COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Tenant' AND COLUMN_NAME='clientFieldsSeededAt'
  UNION ALL SELECT 'Tenant.clientFormSeededAt', COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Tenant' AND COLUMN_NAME='clientFormSeededAt'
  UNION ALL SELECT 'ClientForm table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ClientForm'
  UNION ALL SELECT 'ClientForm.settings', COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ClientForm' AND COLUMN_NAME='settings'
  UNION ALL SELECT 'ClientForm.publishedAtDraftVersion', COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ClientForm' AND COLUMN_NAME='publishedAtDraftVersion'
  UNION ALL SELECT 'FormVersion table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='FormVersion'
  UNION ALL SELECT 'FormSubmission table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='FormSubmission'
  UNION ALL SELECT 'Contract table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Contract'
  UNION ALL SELECT 'ContractPayment table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ContractPayment'
  UNION ALL SELECT 'ContractStatusHistory table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ContractStatusHistory'
) AS checks;

SELECT 'upgrade complete' AS step, NOW() AS at;
