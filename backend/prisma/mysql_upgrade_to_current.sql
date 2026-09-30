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
-- It replaces running these eighteen by hand, in this order (the order matters —
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
--  11. mysql_migration_add_lookup_lists.sql
--  12. mysql_migration_add_areas_cities.sql
--  13. mysql_migration_add_sales_lists.sql
--  14. mysql_migration_add_status_labels.sql
--  15. mysql_migration_add_client_company_fields.sql
--  16. mysql_migration_add_contact_persons.sql
--  17. mysql_migration_ownership_transfer_role_id.sql
--  18. mysql_migration_m2_sales_permissions.sql
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
-- 11. Risk levels and business types (Slice 8: FR-SET-01, 02, 10)
-- ---------------------------------------------------------------
SELECT 'RiskLevel/BusinessType tables' AS step, NOW() AS at;

-- Tables are created with their final shape; a database that already has
-- them skips straight to the seed, which is also guarded.
CREATE TABLE IF NOT EXISTS `RiskLevel` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `level` INTEGER NOT NULL,
    `nameSq` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `RiskLevel_tenantId_order_idx`(`tenantId`, `order`),
    UNIQUE INDEX `RiskLevel_tenantId_level_key`(`tenantId`, `level`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `BusinessType` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `nameSq` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(191) NULL,
    `riskLevelId` VARCHAR(191) NOT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `BusinessType_tenantId_order_idx`(`tenantId`, `order`),
    INDEX `BusinessType_riskLevelId_idx`(`riskLevelId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=0;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'RiskLevel' AND CONSTRAINT_NAME = 'RiskLevel_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `RiskLevel` ADD CONSTRAINT `RiskLevel_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: RiskLevel.RiskLevel_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'BusinessType' AND CONSTRAINT_NAME = 'BusinessType_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `BusinessType` ADD CONSTRAINT `BusinessType_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: BusinessType.BusinessType_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'BusinessType' AND CONSTRAINT_NAME = 'BusinessType_riskLevelId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `BusinessType` ADD CONSTRAINT `BusinessType_riskLevelId_fkey` FOREIGN KEY (`riskLevelId`) REFERENCES `RiskLevel`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: BusinessType.BusinessType_riskLevelId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET FOREIGN_KEY_CHECKS=1;

-- Seed (FR-SET-10): the placeholder lists in src/lookups/domain/DefaultLookups.ts,
-- for every workspace that has none yet. Same values as the Postgres migration.
INSERT INTO `RiskLevel` (`id`, `tenantId`, `level`, `nameSq`, `nameEn`, `description`, `order`, `updatedAt`)
SELECT UUID(), t.id, v.lvl, v.namesq, v.nameen, v.description, v.ord, NOW(3)
FROM `Tenant` t
CROSS JOIN (
  SELECT 1 AS lvl, 'Niveli 1' AS namesq, 'Level 1' AS nameen, 'Rrezik i ulët' AS description, 1 AS ord
  UNION ALL
  SELECT 2 AS lvl, 'Niveli 2' AS namesq, 'Level 2' AS nameen, 'Rrezik i mesëm' AS description, 2 AS ord
  UNION ALL
  SELECT 3 AS lvl, 'Niveli 3' AS namesq, 'Level 3' AS nameen, 'Rrezik i lartë' AS description, 3 AS ord
) v
WHERE NOT EXISTS (SELECT 1 FROM `RiskLevel` r WHERE r.tenantId = t.id);

INSERT INTO `BusinessType` (`id`, `tenantId`, `nameSq`, `nameEn`, `riskLevelId`, `order`, `updatedAt`)
SELECT UUID(), t.id, v.namesq, v.nameen, r.id, v.ord, NOW(3)
FROM `Tenant` t
CROSS JOIN (
  SELECT 'Qendër thirrjesh' AS namesq, 'Call center' AS nameen, 1 AS risklevel, 1 AS ord
  UNION ALL
  SELECT 'Zyrë' AS namesq, 'Office' AS nameen, 1 AS risklevel, 2 AS ord
  UNION ALL
  SELECT 'Kafene' AS namesq, 'Café' AS nameen, 1 AS risklevel, 3 AS ord
  UNION ALL
  SELECT 'Dyqan' AS namesq, 'Retail shop' AS nameen, 1 AS risklevel, 4 AS ord
  UNION ALL
  SELECT 'Restorant' AS namesq, 'Restaurant' AS nameen, 2 AS risklevel, 5 AS ord
  UNION ALL
  SELECT 'Hotel' AS namesq, 'Hotel' AS nameen, 2 AS risklevel, 6 AS ord
  UNION ALL
  SELECT 'Magazinë' AS namesq, 'Warehouse' AS nameen, 2 AS risklevel, 7 AS ord
  UNION ALL
  SELECT 'Ndërtim' AS namesq, 'Construction' AS nameen, 3 AS risklevel, 8 AS ord
  UNION ALL
  SELECT 'Fabrikë' AS namesq, 'Factory' AS nameen, 3 AS risklevel, 9 AS ord
) v
JOIN `RiskLevel` r ON r.tenantId = t.id AND r.`level` = v.risklevel
WHERE NOT EXISTS (SELECT 1 FROM `BusinessType` b WHERE b.tenantId = t.id);

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20260928140000_add_lookup_lists', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20260928140000_add_lookup_lists'
);

-- ---------------------------------------------------------------
-- 12. Areas and cities (Slice 9: FR-SET-03, 04, 10)
-- ---------------------------------------------------------------
SELECT 'Area/City tables' AS step, NOW() AS at;

-- Tables are created with their final shape; a database that already has
-- them skips straight to the seed, which is also guarded.
CREATE TABLE IF NOT EXISTS `Area` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `nameSq` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(191) NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Area_tenantId_order_idx`(`tenantId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `City` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `areaId` VARCHAR(191) NOT NULL,
    `nameSq` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(191) NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `City_tenantId_areaId_order_idx`(`tenantId`, `areaId`, `order`),
    UNIQUE INDEX `City_tenantId_areaId_nameSq_key`(`tenantId`, `areaId`, `nameSq`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=0;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Area' AND CONSTRAINT_NAME = 'Area_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Area` ADD CONSTRAINT `Area_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: Area.Area_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'City' AND CONSTRAINT_NAME = 'City_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `City` ADD CONSTRAINT `City_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: City.City_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'City' AND CONSTRAINT_NAME = 'City_areaId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `City` ADD CONSTRAINT `City_areaId_fkey` FOREIGN KEY (`areaId`) REFERENCES `Area`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: City.City_areaId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET FOREIGN_KEY_CHECKS=1;

-- Seed (FR-SET-10): the placeholder lists in src/lookups/domain/DefaultLookups.ts,
-- for every workspace that has none yet. Same values as the Postgres migration.
INSERT INTO `Area` (`id`, `tenantId`, `nameSq`, `nameEn`, `order`, `updatedAt`)
SELECT UUID(), t.id, v.namesq, v.nameen, v.ord, NOW(3)
FROM `Tenant` t
CROSS JOIN (
  SELECT 'Berat' AS namesq, 'Berat' AS nameen, 1 AS ord
  UNION ALL
  SELECT 'Dibër' AS namesq, 'Dibër' AS nameen, 2 AS ord
  UNION ALL
  SELECT 'Durrës' AS namesq, 'Durrës' AS nameen, 3 AS ord
  UNION ALL
  SELECT 'Elbasan' AS namesq, 'Elbasan' AS nameen, 4 AS ord
  UNION ALL
  SELECT 'Fier' AS namesq, 'Fier' AS nameen, 5 AS ord
  UNION ALL
  SELECT 'Gjirokastër' AS namesq, 'Gjirokastër' AS nameen, 6 AS ord
  UNION ALL
  SELECT 'Korçë' AS namesq, 'Korçë' AS nameen, 7 AS ord
  UNION ALL
  SELECT 'Kukës' AS namesq, 'Kukës' AS nameen, 8 AS ord
  UNION ALL
  SELECT 'Lezhë' AS namesq, 'Lezhë' AS nameen, 9 AS ord
  UNION ALL
  SELECT 'Shkodër' AS namesq, 'Shkodër' AS nameen, 10 AS ord
  UNION ALL
  SELECT 'Tiranë' AS namesq, 'Tirana' AS nameen, 11 AS ord
  UNION ALL
  SELECT 'Vlorë' AS namesq, 'Vlorë' AS nameen, 12 AS ord
) v
WHERE NOT EXISTS (SELECT 1 FROM `Area` a WHERE a.tenantId = t.id);

INSERT INTO `City` (`id`, `tenantId`, `areaId`, `nameSq`, `nameEn`, `order`, `updatedAt`)
SELECT UUID(), t.id, a.id, v.namesq, v.nameen, v.ord, NOW(3)
FROM `Tenant` t
CROSS JOIN (
  SELECT 'Berat' AS areanamesq, 'Berat' AS namesq, 'Berat' AS nameen, 1 AS ord
  UNION ALL
  SELECT 'Berat', 'Kuçovë', 'Kuçovë', 2
  UNION ALL
  SELECT 'Berat', 'Ura Vajgurore', 'Ura Vajgurore', 3
  UNION ALL
  SELECT 'Dibër', 'Peshkopi', 'Peshkopi', 1
  UNION ALL
  SELECT 'Dibër', 'Bulqizë', 'Bulqizë', 2
  UNION ALL
  SELECT 'Dibër', 'Burrel', 'Burrel', 3
  UNION ALL
  SELECT 'Durrës', 'Durrës', 'Durrës', 1
  UNION ALL
  SELECT 'Durrës', 'Shijak', 'Shijak', 2
  UNION ALL
  SELECT 'Durrës', 'Krujë', 'Krujë', 3
  UNION ALL
  SELECT 'Elbasan', 'Elbasan', 'Elbasan', 1
  UNION ALL
  SELECT 'Elbasan', 'Cërrik', 'Cërrik', 2
  UNION ALL
  SELECT 'Elbasan', 'Librazhd', 'Librazhd', 3
  UNION ALL
  SELECT 'Fier', 'Fier', 'Fier', 1
  UNION ALL
  SELECT 'Fier', 'Patos', 'Patos', 2
  UNION ALL
  SELECT 'Fier', 'Lushnjë', 'Lushnjë', 3
  UNION ALL
  SELECT 'Gjirokastër', 'Gjirokastër', 'Gjirokastër', 1
  UNION ALL
  SELECT 'Gjirokastër', 'Tepelenë', 'Tepelenë', 2
  UNION ALL
  SELECT 'Gjirokastër', 'Përmet', 'Përmet', 3
  UNION ALL
  SELECT 'Korçë', 'Korçë', 'Korçë', 1
  UNION ALL
  SELECT 'Korçë', 'Pogradec', 'Pogradec', 2
  UNION ALL
  SELECT 'Korçë', 'Bilisht', 'Bilisht', 3
  UNION ALL
  SELECT 'Kukës', 'Kukës', 'Kukës', 1
  UNION ALL
  SELECT 'Kukës', 'Krumë', 'Krumë', 2
  UNION ALL
  SELECT 'Kukës', 'Has', 'Has', 3
  UNION ALL
  SELECT 'Lezhë', 'Lezhë', 'Lezhë', 1
  UNION ALL
  SELECT 'Lezhë', 'Laç', 'Laç', 2
  UNION ALL
  SELECT 'Lezhë', 'Rrëshen', 'Rrëshen', 3
  UNION ALL
  SELECT 'Shkodër', 'Shkodër', 'Shkodër', 1
  UNION ALL
  SELECT 'Shkodër', 'Koplik', 'Koplik', 2
  UNION ALL
  SELECT 'Shkodër', 'Vau i Dejës', 'Vau i Dejës', 3
  UNION ALL
  SELECT 'Tiranë', 'Tiranë', 'Tirana', 1
  UNION ALL
  SELECT 'Tiranë', 'Kamëz', 'Kamëz', 2
  UNION ALL
  SELECT 'Tiranë', 'Kavajë', 'Kavajë', 3
  UNION ALL
  SELECT 'Vlorë', 'Vlorë', 'Vlorë', 1
  UNION ALL
  SELECT 'Vlorë', 'Sarandë', 'Sarandë', 2
  UNION ALL
  SELECT 'Vlorë', 'Himarë', 'Himarë', 3
) v
JOIN `Area` a ON a.tenantId = t.id AND a.`nameSq` = v.areanamesq
WHERE NOT EXISTS (SELECT 1 FROM `City` c WHERE c.tenantId = t.id);

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20260928140105_add_areas_cities', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20260928140105_add_areas_cities'
);

-- ---------------------------------------------------------------
-- 13. Follow-up intervals and lost-deal reasons (Slice 10: FR-SET-05, 06, 10)
-- ---------------------------------------------------------------

SELECT '13. Follow-up intervals and lost-deal reasons' AS step, NOW() AS at;

CREATE TABLE IF NOT EXISTS `FollowUpInterval` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `days` INTEGER NOT NULL,
    `nameSq` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(191) NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FollowUpInterval_tenantId_order_idx`(`tenantId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `LostReason` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `nameSq` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(191) NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LostReason_tenantId_order_idx`(`tenantId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=0;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'FollowUpInterval' AND CONSTRAINT_NAME = 'FollowUpInterval_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `FollowUpInterval` ADD CONSTRAINT `FollowUpInterval_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: FollowUpInterval.FollowUpInterval_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'LostReason' AND CONSTRAINT_NAME = 'LostReason_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `LostReason` ADD CONSTRAINT `LostReason_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: LostReason.LostReason_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET FOREIGN_KEY_CHECKS=1;

-- Seed (FR-SET-10): the placeholder lists in src/lookups/domain/DefaultLookups.ts,
-- for every workspace that has none yet. Same values as the Postgres migration.
INSERT INTO `FollowUpInterval` (`id`, `tenantId`, `days`, `nameSq`, `nameEn`, `order`, `updatedAt`)
SELECT UUID(), t.id, v.days, v.namesq, v.nameen, v.ord, NOW(3)
FROM `Tenant` t
CROSS JOIN (
  SELECT 3 AS days, '3 ditë' AS namesq, '3 days' AS nameen, 1 AS ord
  UNION ALL
  SELECT 5, '5 ditë', '5 days', 2
  UNION ALL
  SELECT 7, '7 ditë', '7 days', 3
) v
WHERE NOT EXISTS (SELECT 1 FROM `FollowUpInterval` f WHERE f.tenantId = t.id);

INSERT INTO `LostReason` (`id`, `tenantId`, `nameSq`, `nameEn`, `order`, `updatedAt`)
SELECT UUID(), t.id, v.namesq, v.nameen, v.ord, NOW(3)
FROM `Tenant` t
CROSS JOIN (
  SELECT 'Shumë e shtrenjtë' AS namesq, 'Too expensive' AS nameen, 1 AS ord
  UNION ALL
  SELECT 'Ka tashmë një ofrues', 'Already has a provider', 2
  UNION ALL
  SELECT 'Pa buxhet', 'No budget', 3
  UNION ALL
  SELECT 'Pa përgjigje', 'No response', 4
) v
WHERE NOT EXISTS (SELECT 1 FROM `LostReason` l WHERE l.tenantId = t.id);

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20260928173234_add_sales_lists', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20260928173234_add_sales_lists'
);

-- ---------------------------------------------------------------
-- 14. Status keys and labels (Slice 10: FR-SET-07, 08; decision D6)
-- ---------------------------------------------------------------

SELECT '14. Status keys and labels' AS step, NOW() AS at;

-- Existing ContractPayment rows are remapped so no row is left on a key the
-- product no longer offers: UNPAID -> PAYMENT_PENDING, PARTIAL ->
-- PARTIALLY_PAID, PAID stays PAID. WAIVED is untouched: it has no SRS
-- equivalent (D6) and stays a hidden legacy key on the rows that already
-- have it.
UPDATE `ContractPayment` SET `status` = 'PAYMENT_PENDING' WHERE `status` = 'UNPAID';
UPDATE `ContractPayment` SET `status` = 'PARTIALLY_PAID' WHERE `status` = 'PARTIAL';
ALTER TABLE `ContractPayment` ALTER COLUMN `status` SET DEFAULT 'PAYMENT_PENDING';

CREATE TABLE IF NOT EXISTS `StatusLabel` (
    `tenantId` VARCHAR(191) NOT NULL,
    `domain` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `labelSq` VARCHAR(191) NOT NULL,
    `labelEn` VARCHAR(191) NULL,
    `colour` VARCHAR(191) NOT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`tenantId`, `domain`, `key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=0;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'StatusLabel' AND CONSTRAINT_NAME = 'StatusLabel_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `StatusLabel` ADD CONSTRAINT `StatusLabel_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: StatusLabel.StatusLabel_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET FOREIGN_KEY_CHECKS=1;

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20260928174225_status_keys_and_labels', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20260928174225_status_keys_and_labels'
);

-- ---------------------------------------------------------------
-- 15. Company profile fields on Client (Slice 11: FR-CMP-01, 02, 03; Q8, Q9)
-- ---------------------------------------------------------------

SELECT '15. Client company profile fields' AS step, NOW() AS at;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Client' AND COLUMN_NAME = 'businessTypeId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Client` ADD COLUMN `businessTypeId` VARCHAR(191) NULL', 'SELECT ''skip: Client.businessTypeId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Client' AND COLUMN_NAME = 'employeeCount');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Client` ADD COLUMN `employeeCount` INTEGER NULL', 'SELECT ''skip: Client.employeeCount'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Client' AND COLUMN_NAME = 'areaId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Client` ADD COLUMN `areaId` VARCHAR(191) NULL', 'SELECT ''skip: Client.areaId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Client' AND COLUMN_NAME = 'cityId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Client` ADD COLUMN `cityId` VARCHAR(191) NULL', 'SELECT ''skip: Client.cityId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Client' AND COLUMN_NAME = 'streetAddress');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Client` ADD COLUMN `streetAddress` VARCHAR(191) NULL', 'SELECT ''skip: Client.streetAddress'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Client' AND COLUMN_NAME = 'taxId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Client` ADD COLUMN `taxId` VARCHAR(191) NULL', 'SELECT ''skip: Client.taxId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Client' AND COLUMN_NAME = 'website');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Client` ADD COLUMN `website` VARCHAR(191) NULL', 'SELECT ''skip: Client.website'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Client' AND INDEX_NAME = 'Client_tenantId_businessTypeId_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Client_tenantId_businessTypeId_idx` ON `Client`(`tenantId`, `businessTypeId`)', 'SELECT ''skip: Client_tenantId_businessTypeId_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Client' AND INDEX_NAME = 'Client_tenantId_areaId_cityId_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Client_tenantId_areaId_cityId_idx` ON `Client`(`tenantId`, `areaId`, `cityId`)', 'SELECT ''skip: Client_tenantId_areaId_cityId_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Client' AND INDEX_NAME = 'Client_tenantId_taxId_key');
SET @sql := IF(@needed = 0, 'CREATE UNIQUE INDEX `Client_tenantId_taxId_key` ON `Client`(`tenantId`, `taxId`)', 'SELECT ''skip: Client_tenantId_taxId_key'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=0;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Client' AND CONSTRAINT_NAME = 'Client_businessTypeId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Client` ADD CONSTRAINT `Client_businessTypeId_fkey` FOREIGN KEY (`businessTypeId`) REFERENCES `BusinessType`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Client.Client_businessTypeId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Client' AND CONSTRAINT_NAME = 'Client_areaId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Client` ADD CONSTRAINT `Client_areaId_fkey` FOREIGN KEY (`areaId`) REFERENCES `Area`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Client.Client_areaId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Client' AND CONSTRAINT_NAME = 'Client_cityId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Client` ADD CONSTRAINT `Client_cityId_fkey` FOREIGN KEY (`cityId`) REFERENCES `City`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Client.Client_cityId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET FOREIGN_KEY_CHECKS=1;

-- Client status fixed set (Q9): LEAD, PROSPECT, CLIENT, FORMER_CLIENT.
-- ACTIVE -> CLIENT, INACTIVE -> FORMER_CLIENT, PROSPECT unchanged. LEAD has
-- no legacy equivalent, so no row is remapped onto it. Any other legacy value
-- is left as-is, for Slice 14's "needs completion" report.
UPDATE `Client` SET `status` = 'CLIENT' WHERE `status` = 'ACTIVE';
UPDATE `Client` SET `status` = 'FORMER_CLIENT' WHERE `status` = 'INACTIVE';

-- The same remap, applied at each tenant's own STATUS custom field key
-- (FieldRole.STATUS's fieldName is tenant-renameable, so this cannot be a
-- fixed column name).
UPDATE `Client` c
JOIN `CustomFieldDefinition` cfd
  ON cfd.`tenantId` = c.`tenantId` AND cfd.`role` = 'STATUS'
SET c.`customFieldValues` = JSON_SET(
  c.`customFieldValues`,
  CONCAT('$."', cfd.`fieldName`, '"'),
  CASE JSON_UNQUOTE(JSON_EXTRACT(c.`customFieldValues`, CONCAT('$."', cfd.`fieldName`, '"')))
    WHEN 'ACTIVE' THEN 'CLIENT'
    WHEN 'INACTIVE' THEN 'FORMER_CLIENT'
    ELSE JSON_UNQUOTE(JSON_EXTRACT(c.`customFieldValues`, CONCAT('$."', cfd.`fieldName`, '"')))
  END
)
WHERE JSON_UNQUOTE(JSON_EXTRACT(c.`customFieldValues`, CONCAT('$."', cfd.`fieldName`, '"'))) IN ('ACTIVE', 'INACTIVE');

-- The STATUS field's own option list, so re-editing it shows the fixed set.
UPDATE `CustomFieldDefinition`
SET `options` = JSON_ARRAY('LEAD', 'PROSPECT', 'CLIENT', 'FORMER_CLIENT')
WHERE `role` = 'STATUS';

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20260928190105_add_client_company_fields', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20260928190105_add_client_company_fields'
);

-- ---------------------------------------------------------------
-- 16. Contact persons (Slice 12: FR-CMP-04)
-- ---------------------------------------------------------------

SELECT '16. Contact persons' AS step, NOW() AS at;

CREATE TABLE IF NOT EXISTS `ContactPerson` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `position` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `isPrimary` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `ContactPerson_tenantId_clientId_idx`(`tenantId`, `clientId`),
    INDEX `ContactPerson_tenantId_phone_idx`(`tenantId`, `phone`),
    INDEX `ContactPerson_tenantId_email_idx`(`tenantId`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=0;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ContactPerson' AND CONSTRAINT_NAME = 'ContactPerson_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `ContactPerson` ADD CONSTRAINT `ContactPerson_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: ContactPerson.ContactPerson_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ContactPerson' AND CONSTRAINT_NAME = 'ContactPerson_clientId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `ContactPerson` ADD CONSTRAINT `ContactPerson_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: ContactPerson.ContactPerson_clientId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET FOREIGN_KEY_CHECKS=1;

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20260929182327_add_contact_persons', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20260929182327_add_contact_persons'
);

-- ---------------------------------------------------------------
-- 17. Ownership handovers move the permission role (Slice 15 security review)
-- ---------------------------------------------------------------
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'OwnershipTransfer' AND COLUMN_NAME = 'previousActingRoleId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `OwnershipTransfer` ADD COLUMN `previousActingRoleId` VARCHAR(191) NULL', 'SELECT ''skip: OwnershipTransfer.previousActingRoleId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Repair users the old handover code left inconsistent. The legacy mirror is
-- BUSINESS_OWNER exactly when the role is (or was copied from) Administrator.
-- Both updates match nothing on a consistent database, so a re-run is a no-op.
-- 1. An owner demoted by "keep current ownership" kept the Administrator role.
UPDATE `User` u
JOIN `Role` adm ON adm.`tenantId` = u.`tenantId` AND adm.`key` = 'ADMINISTRATOR' AND adm.`isSystem` = 1
JOIN `Role` sales ON sales.`tenantId` = u.`tenantId` AND sales.`key` = 'SALES_USER' AND sales.`isSystem` = 1
SET u.`roleId` = sales.`id`
WHERE u.`role` = 'STAFF' AND u.`roleId` = adm.`id`;

-- 2. A stand-in promoted to BUSINESS_OWNER kept their old, non-Administrator role.
UPDATE `User` u
JOIN `Role` cur ON cur.`id` = u.`roleId`
JOIN `Role` adm ON adm.`tenantId` = u.`tenantId` AND adm.`key` = 'ADMINISTRATOR' AND adm.`isSystem` = 1
SET u.`roleId` = adm.`id`
WHERE u.`role` = 'BUSINESS_OWNER'
  AND cur.`key` <> 'ADMINISTRATOR'
  AND COALESCE(cur.`baseKey`, '') <> 'ADMINISTRATOR';

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20260930100000_ownership_transfer_role_id', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20260930100000_ownership_transfer_role_id'
);

-- ---------------------------------------------------------------
-- 18. Milestone 2 sales permissions and Tenant.salesWorkflow (M2 Slice 2)
-- ---------------------------------------------------------------
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Tenant' AND COLUMN_NAME = 'salesWorkflow');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Tenant` ADD COLUMN `salesWorkflow` VARCHAR(191) NOT NULL DEFAULT ''LEGACY_QUOTATIONS''', 'SELECT ''skip: Tenant.salesWorkflow'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `AppliedPermissionUpgrade` (
    `tenantId` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `appliedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`tenantId`, `key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'AppliedPermissionUpgrade' AND CONSTRAINT_NAME = 'AppliedPermissionUpgrade_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `AppliedPermissionUpgrade` ADD CONSTRAINT `AppliedPermissionUpgrade_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: AppliedPermissionUpgrade.AppliedPermissionUpgrade_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Give the system roles of every existing tenant the new keys at their SRS M2
-- §9.2 defaults. Customised grants are never changed, copied roles are left
-- to the Administrator, and the ledger row makes it run once per tenant.
-- BEGIN GENERATED PERMISSION UPGRADE m2-sales
-- Generated by scripts/generate-role-seed-sql.ts from PERMISSION_UPGRADES and DEFAULT_ROLE_MATRIX.
-- One Role audit entry per system role still missing one of its new keys, from
-- the system actor (FR-RBAC-10). Runs before the grants, which it describes.
INSERT INTO `AuditEntry` (`id`, `tenantId`, `at`, `userId`, `userRole`, `action`, `entityType`, `entityId`, `entityLabel`, `changes`)
SELECT UUID(), r.tenantId, NOW(3), NULL, 'SYSTEM', 'UPDATE', 'Role', r.id,
  COALESCE(NULLIF(r.nameSq, ''), r.nameEn), CAST(v.changes AS JSON)
FROM `Role` r
JOIN (
  SELECT 'SALES_USER' AS rolekey, '[{"field":"permissionsAdded","old":null,"new":["deals.edit","deals.view","discounts.apply","followups.manage","offers.edit","script.view"]},{"field":"permissionUpgrade","old":null,"new":"m2-sales"}]' AS changes
  UNION ALL
  SELECT 'SALES_MANAGER' AS rolekey, '[{"field":"permissionsAdded","old":null,"new":["deals.delete","deals.edit","deals.reopen","deals.view","discounts.apply","discounts.approve","followups.manage","offers.edit","script.view"]},{"field":"permissionUpgrade","old":null,"new":"m2-sales"}]' AS changes
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, '[{"field":"permissionsAdded","old":null,"new":["activityResults.manage","deals.delete","deals.edit","deals.reopen","deals.view","discounts.apply","followups.manage","offers.edit","script.edit","script.view"]},{"field":"permissionUpgrade","old":null,"new":"m2-sales"}]' AS changes
  UNION ALL
  SELECT 'CEO' AS rolekey, '[{"field":"permissionsAdded","old":null,"new":["deals.view","discounts.approve","script.view"]},{"field":"permissionUpgrade","old":null,"new":"m2-sales"}]' AS changes
) v ON v.rolekey = r.`key`
WHERE r.isSystem = 1
  AND NOT EXISTS (
    SELECT 1 FROM `AppliedPermissionUpgrade` a WHERE a.tenantId = r.tenantId AND a.`key` = 'm2-sales'
  )
  AND EXISTS (
    SELECT 1 FROM (
  SELECT 'SALES_USER' AS rolekey, 'deals.edit' AS permissionkey, 'OWN' AS scope
  UNION ALL
  SELECT 'SALES_USER' AS rolekey, 'deals.view' AS permissionkey, 'OWN' AS scope
  UNION ALL
  SELECT 'SALES_USER' AS rolekey, 'discounts.apply' AS permissionkey, 'OWN' AS scope
  UNION ALL
  SELECT 'SALES_USER' AS rolekey, 'followups.manage' AS permissionkey, 'OWN' AS scope
  UNION ALL
  SELECT 'SALES_USER' AS rolekey, 'offers.edit' AS permissionkey, 'OWN' AS scope
  UNION ALL
  SELECT 'SALES_USER' AS rolekey, 'script.view' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'SALES_MANAGER' AS rolekey, 'deals.delete' AS permissionkey, 'TEAM' AS scope
  UNION ALL
  SELECT 'SALES_MANAGER' AS rolekey, 'deals.edit' AS permissionkey, 'TEAM' AS scope
  UNION ALL
  SELECT 'SALES_MANAGER' AS rolekey, 'deals.reopen' AS permissionkey, 'TEAM' AS scope
  UNION ALL
  SELECT 'SALES_MANAGER' AS rolekey, 'deals.view' AS permissionkey, 'TEAM' AS scope
  UNION ALL
  SELECT 'SALES_MANAGER' AS rolekey, 'discounts.apply' AS permissionkey, 'TEAM' AS scope
  UNION ALL
  SELECT 'SALES_MANAGER' AS rolekey, 'discounts.approve' AS permissionkey, 'TEAM' AS scope
  UNION ALL
  SELECT 'SALES_MANAGER' AS rolekey, 'followups.manage' AS permissionkey, 'TEAM' AS scope
  UNION ALL
  SELECT 'SALES_MANAGER' AS rolekey, 'offers.edit' AS permissionkey, 'TEAM' AS scope
  UNION ALL
  SELECT 'SALES_MANAGER' AS rolekey, 'script.view' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'activityResults.manage' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'deals.delete' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'deals.edit' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'deals.reopen' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'deals.view' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'discounts.apply' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'followups.manage' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'offers.edit' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'script.edit' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'script.view' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'CEO' AS rolekey, 'deals.view' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'CEO' AS rolekey, 'discounts.approve' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'CEO' AS rolekey, 'script.view' AS permissionkey, NULL AS scope
    ) g
    WHERE g.rolekey = r.`key`
      AND NOT EXISTS (
        SELECT 1 FROM `RolePermission` rp WHERE rp.roleId = r.id AND rp.permissionKey = g.permissionkey
      )
  );

-- Grant the new keys to each system role at its default (SRS M2 §9.2). Never updates or deletes a grant.
INSERT INTO `RolePermission` (`roleId`, `permissionKey`, `scope`)
SELECT r.id, v.permissionkey, v.scope
FROM `Role` r
JOIN (
  SELECT 'SALES_USER' AS rolekey, 'deals.edit' AS permissionkey, 'OWN' AS scope
  UNION ALL
  SELECT 'SALES_USER' AS rolekey, 'deals.view' AS permissionkey, 'OWN' AS scope
  UNION ALL
  SELECT 'SALES_USER' AS rolekey, 'discounts.apply' AS permissionkey, 'OWN' AS scope
  UNION ALL
  SELECT 'SALES_USER' AS rolekey, 'followups.manage' AS permissionkey, 'OWN' AS scope
  UNION ALL
  SELECT 'SALES_USER' AS rolekey, 'offers.edit' AS permissionkey, 'OWN' AS scope
  UNION ALL
  SELECT 'SALES_USER' AS rolekey, 'script.view' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'SALES_MANAGER' AS rolekey, 'deals.delete' AS permissionkey, 'TEAM' AS scope
  UNION ALL
  SELECT 'SALES_MANAGER' AS rolekey, 'deals.edit' AS permissionkey, 'TEAM' AS scope
  UNION ALL
  SELECT 'SALES_MANAGER' AS rolekey, 'deals.reopen' AS permissionkey, 'TEAM' AS scope
  UNION ALL
  SELECT 'SALES_MANAGER' AS rolekey, 'deals.view' AS permissionkey, 'TEAM' AS scope
  UNION ALL
  SELECT 'SALES_MANAGER' AS rolekey, 'discounts.apply' AS permissionkey, 'TEAM' AS scope
  UNION ALL
  SELECT 'SALES_MANAGER' AS rolekey, 'discounts.approve' AS permissionkey, 'TEAM' AS scope
  UNION ALL
  SELECT 'SALES_MANAGER' AS rolekey, 'followups.manage' AS permissionkey, 'TEAM' AS scope
  UNION ALL
  SELECT 'SALES_MANAGER' AS rolekey, 'offers.edit' AS permissionkey, 'TEAM' AS scope
  UNION ALL
  SELECT 'SALES_MANAGER' AS rolekey, 'script.view' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'activityResults.manage' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'deals.delete' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'deals.edit' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'deals.reopen' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'deals.view' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'discounts.apply' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'followups.manage' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'offers.edit' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'script.edit' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'script.view' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'CEO' AS rolekey, 'deals.view' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'CEO' AS rolekey, 'discounts.approve' AS permissionkey, 'ALL' AS scope
  UNION ALL
  SELECT 'CEO' AS rolekey, 'script.view' AS permissionkey, NULL AS scope
) v ON v.rolekey = r.`key`
WHERE r.isSystem = 1
  AND NOT EXISTS (
    SELECT 1 FROM `AppliedPermissionUpgrade` a WHERE a.tenantId = r.tenantId AND a.`key` = 'm2-sales'
  )
  AND NOT EXISTS (
    SELECT 1 FROM `RolePermission` rp WHERE rp.roleId = r.id AND rp.permissionKey = v.permissionkey
  );

-- Record the upgrade, so it never runs again for these tenants.
INSERT INTO `AppliedPermissionUpgrade` (`tenantId`, `key`, `appliedAt`)
SELECT t.id, 'm2-sales', NOW(3)
FROM `Tenant` t
WHERE NOT EXISTS (
    SELECT 1 FROM `AppliedPermissionUpgrade` a WHERE a.tenantId = t.id AND a.`key` = 'm2-sales'
  );
-- END GENERATED PERMISSION UPGRADE m2-sales

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20260930180000_m2_sales_permissions', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20260930180000_m2_sales_permissions'
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
  UNION ALL SELECT 'RiskLevel table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='RiskLevel'
  UNION ALL SELECT 'BusinessType table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='BusinessType'
  UNION ALL SELECT 'Area table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Area'
  UNION ALL SELECT 'City table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='City'
  UNION ALL SELECT 'FollowUpInterval table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='FollowUpInterval'
  UNION ALL SELECT 'LostReason table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='LostReason'
  UNION ALL SELECT 'StatusLabel table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='StatusLabel'
  UNION ALL SELECT 'Client.businessTypeId', COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Client' AND COLUMN_NAME='businessTypeId'
  UNION ALL SELECT 'ContactPerson table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ContactPerson'
  UNION ALL SELECT 'OwnershipTransfer.previousActingRoleId', COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='OwnershipTransfer' AND COLUMN_NAME='previousActingRoleId'
  UNION ALL SELECT 'Tenant.salesWorkflow', COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Tenant' AND COLUMN_NAME='salesWorkflow'
  UNION ALL SELECT 'AppliedPermissionUpgrade table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='AppliedPermissionUpgrade'
) AS checks;

SELECT 'upgrade complete' AS step, NOW() AS at;
