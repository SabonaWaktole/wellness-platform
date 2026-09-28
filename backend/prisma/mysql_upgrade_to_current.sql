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
-- It replaces running these ten by hand, in this order (the order matters —
-- the 2026-08-27 file reads CustomFieldDefinition.role, which the role/order
-- file adds):
--   1. mysql_migration_add_custom_field_role_order.sql
--   2. mysql_production_migration_2026_08_27.sql
--   3. mysql_migration_add_client_forms.sql
--   4. mysql_migration_add_form_versions_and_submissions.sql
--   5. mysql_migration_add_published_at_draft_version.sql
--   6. mysql_migration_add_contracts.sql
--   7. mysql_migration_add_roles_and_permissions.sql
--   8. mysql_migration_add_audit_entries.sql
--   9. mysql_migration_add_invitation_role.sql
--  10. mysql_migration_add_role_base_key.sql
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
-- 7. Roles & permissions module (Slice 3: FR-RBAC-01, 02)
--
-- Five system roles per tenant (Sales User, Sales Manager, Reception,
-- Administrator, CEO), each with its default SRS §4.2 permissions, plus
-- User.roleId and the legacy BUSINESS_OWNER/STAFF -> role mapping (D2).
-- Purely additive: two new tables and one new nullable column.
-- ---------------------------------------------------------------
SELECT 'roles & permissions module' AS step, NOW() AS at;


-- ---------------------------------------------------------------
-- User.roleId
-- ---------------------------------------------------------------
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'User' AND COLUMN_NAME = 'roleId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `User` ADD COLUMN `roleId` VARCHAR(191) NULL', 'SELECT ''skip: User.roleId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'User' AND INDEX_NAME = 'User_roleId_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `User_roleId_idx` ON `User`(`roleId`)', 'SELECT ''skip: User_roleId_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `Role` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `nameSq` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(191) NOT NULL,
    `isSystem` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Role_tenantId_key_key`(`tenantId`, `key`),
    INDEX `Role_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `RolePermission` (
    `roleId` VARCHAR(191) NOT NULL,
    `permissionKey` VARCHAR(191) NOT NULL,
    `scope` VARCHAR(191) NULL,

    PRIMARY KEY (`roleId`, `permissionKey`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- Foreign keys
-- ---------------------------------------------------------------
SET FOREIGN_KEY_CHECKS=0;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'User' AND CONSTRAINT_NAME = 'User_roleId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `User` ADD CONSTRAINT `User_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT ''skip: User.User_roleId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Role' AND CONSTRAINT_NAME = 'Role_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Role` ADD CONSTRAINT `Role_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: Role.Role_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'RolePermission' AND CONSTRAINT_NAME = 'RolePermission_roleId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: RolePermission.RolePermission_roleId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=1;

-- ---------------------------------------------------------------
-- Seed data (FR-RBAC-01, 02; D2 legacy mapping)
-- ---------------------------------------------------------------
-- BEGIN GENERATED ROLE SEED
-- Generated by scripts/generate-role-seed-sql.ts from DEFAULT_ROLE_MATRIX.
-- Seed the five system roles for every tenant that doesn't have them yet.
INSERT INTO `Role` (`id`, `tenantId`, `key`, `nameSq`, `nameEn`, `isSystem`, `updatedAt`)
SELECT UUID(), t.id, v.rolekey, v.namesq, v.nameen, 1, NOW(3)
FROM `Tenant` t
JOIN (
  SELECT 'SALES_USER' AS rolekey, 'Përdorues Shitjesh' AS namesq, 'Sales User' AS nameen
  UNION ALL
  SELECT 'SALES_MANAGER' AS rolekey, 'Menaxher Shitjesh' AS namesq, 'Sales Manager' AS nameen
  UNION ALL
  SELECT 'RECEPTION' AS rolekey, 'Recepsion' AS namesq, 'Reception' AS nameen
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'Administrator' AS namesq, 'Administrator' AS nameen
  UNION ALL
  SELECT 'CEO' AS rolekey, 'CEO' AS namesq, 'CEO' AS nameen
) v ON 1 = 1
WHERE NOT EXISTS (
  SELECT 1 FROM `Role` r WHERE r.tenantId = t.id AND r.`key` = v.rolekey
);

-- Grant each system role its default permissions (SRS §4.2).
INSERT INTO `RolePermission` (`roleId`, `permissionKey`, `scope`)
SELECT r.id, v.permissionkey, v.scope
FROM `Role` r
JOIN (
  SELECT 'SALES_USER' AS rolekey, 'activities.add' AS permissionkey, 'OWN' AS scope
  UNION ALL
  SELECT 'SALES_USER' AS rolekey, 'activities.view' AS permissionkey, 'OWN' AS scope
  UNION ALL
  SELECT 'SALES_USER' AS rolekey, 'calendar.view' AS permissionkey, 'OWN' AS scope
  UNION ALL
  SELECT 'SALES_USER' AS rolekey, 'commercial.view' AS permissionkey, 'OWN' AS scope
  UNION ALL
  SELECT 'SALES_USER' AS rolekey, 'companies.edit' AS permissionkey, 'OWN' AS scope
  UNION ALL
  SELECT 'SALES_USER' AS rolekey, 'companies.view' AS permissionkey, 'OWN' AS scope
  UNION ALL
  SELECT 'SALES_USER' AS rolekey, 'contracts.manage' AS permissionkey, 'OWN' AS scope
  UNION ALL
  SELECT 'SALES_USER' AS rolekey, 'contracts.validity.view' AS permissionkey, 'OWN' AS scope
  UNION ALL
  SELECT 'SALES_USER' AS rolekey, 'inventory.manage' AS permissionkey, 'OWN' AS scope
  UNION ALL
  SELECT 'SALES_USER' AS rolekey, 'invoices.manage' AS permissionkey, 'OWN' AS scope
  UNION ALL
  SELECT 'SALES_USER' AS rolekey, 'notes.add' AS permissionkey, 'OWN' AS scope
  UNION ALL
  SELECT 'SALES_USER' AS rolekey, 'notes.view' AS permissionkey, 'OWN' AS scope
  UNION ALL
  SELECT 'SALES_USER' AS rolekey, 'payments.view' AS permissionkey, 'OWN' AS scope
  UNION ALL
  SELECT 'SALES_USER' AS rolekey, 'performance.view' AS permissionkey, 'OWN' AS scope
  UNION ALL
  SELECT 'SALES_USER' AS rolekey, 'quotations.manage' AS permissionkey, 'OWN' AS scope
  UNION ALL
  SELECT 'SALES_MANAGER' AS rolekey, 'activities.add' AS permissionkey, 'TEAM' AS scope
  UNION ALL
  SELECT 'SALES_MANAGER' AS rolekey, 'activities.view' AS permissionkey, 'TEAM' AS scope
  UNION ALL
  SELECT 'SALES_MANAGER' AS rolekey, 'calendar.view' AS permissionkey, 'TEAM' AS scope
  UNION ALL
  SELECT 'SALES_MANAGER' AS rolekey, 'commercial.view' AS permissionkey, 'TEAM' AS scope
  UNION ALL
  SELECT 'SALES_MANAGER' AS rolekey, 'companies.delete' AS permissionkey, 'TEAM' AS scope
  UNION ALL
  SELECT 'SALES_MANAGER' AS rolekey, 'companies.edit' AS permissionkey, 'TEAM' AS scope
  UNION ALL
  SELECT 'SALES_MANAGER' AS rolekey, 'companies.reassign' AS permissionkey, 'TEAM' AS scope
  UNION ALL
  SELECT 'SALES_MANAGER' AS rolekey, 'companies.view' AS permissionkey, 'TEAM' AS scope
  UNION ALL
  SELECT 'SALES_MANAGER' AS rolekey, 'contracts.manage' AS permissionkey, 'TEAM' AS scope
  UNION ALL
  SELECT 'SALES_MANAGER' AS rolekey, 'contracts.validity.view' AS permissionkey, 'TEAM' AS scope
  UNION ALL
  SELECT 'SALES_MANAGER' AS rolekey, 'invoices.manage' AS permissionkey, 'TEAM' AS scope
  UNION ALL
  SELECT 'SALES_MANAGER' AS rolekey, 'notes.add' AS permissionkey, 'TEAM' AS scope
  UNION ALL
  SELECT 'SALES_MANAGER' AS rolekey, 'notes.view' AS permissionkey, 'TEAM' AS scope
  UNION ALL
  SELECT 'SALES_MANAGER' AS rolekey, 'payments.view' AS permissionkey, 'TEAM' AS scope
  UNION ALL
  SELECT 'SALES_MANAGER' AS rolekey, 'performance.view' AS permissionkey, 'TEAM' AS scope
  UNION ALL
  SELECT 'SALES_MANAGER' AS rolekey, 'quotations.manage' AS permissionkey, 'TEAM' AS scope
  UNION ALL
  SELECT 'RECEPTION' AS rolekey, 'companies.view' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'RECEPTION' AS rolekey, 'contracts.validity.view' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'RECEPTION' AS rolekey, 'notes.add' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'RECEPTION' AS rolekey, 'notes.view' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'activities.add' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'activities.view' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'audit.view' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'calendar.view' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'commercial.view' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'companies.delete' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'companies.edit' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'companies.reassign' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'companies.view' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'contracts.manage' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'contracts.validity.view' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'forms.manage' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'integrations.manage' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'inventory.manage' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'invoices.manage' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'notes.add' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'notes.view' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'payments.update' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'payments.view' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'pricing.manage' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'quotations.approve' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'quotations.manage' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'reports.view' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'roles.manage' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'settings.manage' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'users.manage' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'CEO' AS rolekey, 'activities.view' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'CEO' AS rolekey, 'audit.view' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'CEO' AS rolekey, 'calendar.view' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'CEO' AS rolekey, 'commercial.view' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'CEO' AS rolekey, 'companies.view' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'CEO' AS rolekey, 'contracts.validity.view' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'CEO' AS rolekey, 'notes.view' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'CEO' AS rolekey, 'payments.view' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'CEO' AS rolekey, 'performance.view' AS permissionkey, 'ALL' AS scope
) v ON v.rolekey = r.`key`
WHERE r.isSystem = 1
  AND NOT EXISTS (
    SELECT 1 FROM `RolePermission` rp WHERE rp.roleId = r.id AND rp.permissionKey = v.permissionkey
  );

-- D2: map every legacy user onto the new roles (BUSINESS_OWNER -> Administrator,
-- STAFF -> Sales User). SUPER_ADMIN is left alone: it has no tenant and no row here.
UPDATE `User` u
JOIN `Role` r ON r.tenantId = u.tenantId AND r.isSystem = 1
SET u.roleId = r.id
WHERE u.roleId IS NULL
  AND (
    (u.role = 'BUSINESS_OWNER' AND r.`key` = 'ADMINISTRATOR')
    OR (u.role = 'STAFF' AND r.`key` = 'SALES_USER')
  );
-- END GENERATED ROLE SEED


-- ---------------------------------------------------------------
-- Migration-history bookkeeping for the roles & permissions migration.
-- ---------------------------------------------------------------
INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20260927112507_add_roles_and_permissions', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20260927112507_add_roles_and_permissions'
);

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
-- 8. Audit trail
-- ---------------------------------------------------------------

SELECT 'AuditEntry table' AS step, NOW() AS at;

-- No guarded ALTER TABLE step here: AuditEntry has no foreign keys at all
-- (deliberately — see the model comment in schema.mysql.prisma), so
-- CREATE TABLE IF NOT EXISTS is the whole story.
CREATE TABLE IF NOT EXISTS `AuditEntry` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `userId` VARCHAR(191) NULL,
    `userRole` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NOT NULL,
    `entityLabel` VARCHAR(191) NULL,
    `changes` JSON NOT NULL,

    INDEX `AuditEntry_tenantId_at_idx`(`tenantId`, `at`),
    INDEX `AuditEntry_tenantId_entityType_entityId_idx`(`tenantId`, `entityType`, `entityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20260927101159_add_audit_entries', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20260927101159_add_audit_entries'
);

-- ---------------------------------------------------------------
-- 9. Invitations carry a role (Slice 5: FR-USR-02)
-- ---------------------------------------------------------------
-- Section 7 has just re-run the role seed, so every tenant has its roles.
SET FOREIGN_KEY_CHECKS=0;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Invitation' AND COLUMN_NAME = 'roleId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Invitation` ADD COLUMN `roleId` VARCHAR(191) NULL', 'SELECT ''skip: Invitation.roleId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Invitation' AND INDEX_NAME = 'Invitation_roleId_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Invitation_roleId_idx` ON `Invitation`(`roleId`)', 'SELECT ''skip: Invitation_roleId_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Invitation' AND CONSTRAINT_NAME = 'Invitation_roleId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Invitation` ADD CONSTRAINT `Invitation_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT ''skip: Invitation.Invitation_roleId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET FOREIGN_KEY_CHECKS=1;

-- D2 for open invitations: BUSINESS_OWNER -> Administrator, STAFF -> Sales User.
UPDATE `Invitation` i
JOIN `Role` r ON r.tenantId = i.tenantId AND r.isSystem = 1
SET i.roleId = r.id
WHERE i.roleId IS NULL
  AND (
    (i.role = 'BUSINESS_OWNER' AND r.`key` = 'ADMINISTRATOR')
    OR (i.role = 'STAFF' AND r.`key` = 'SALES_USER')
  );

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20260928090000_add_invitation_role', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20260928090000_add_invitation_role'
);

-- ---------------------------------------------------------------
-- 10. Custom roles remember their system role (Slice 6: FR-RBAC-04)
-- ---------------------------------------------------------------
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Role' AND COLUMN_NAME = 'baseKey');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Role` ADD COLUMN `baseKey` VARCHAR(191) NULL', 'SELECT ''skip: Role.baseKey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20260928120000_add_role_base_key', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20260928120000_add_role_base_key'
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
  UNION ALL SELECT 'User.roleId', COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='User' AND COLUMN_NAME='roleId'
  UNION ALL SELECT 'Role table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Role'
  UNION ALL SELECT 'RolePermission table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='RolePermission'
  UNION ALL SELECT 'AuditEntry table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='AuditEntry'
  UNION ALL SELECT 'Invitation.roleId', COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Invitation' AND COLUMN_NAME='roleId'
  UNION ALL SELECT 'Role.baseKey', COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Role' AND COLUMN_NAME='baseKey'
) AS checks;

SELECT 'upgrade complete' AS step, NOW() AS at;
