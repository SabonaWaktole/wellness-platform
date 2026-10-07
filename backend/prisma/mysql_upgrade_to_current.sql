-- NevaCRM — bring a live MySQL database up to the current schema.
--
-- SAFE TO RUN ON PRODUCTION, AND SAFE TO RUN TWICE. Every statement is guarded
-- against information_schema, so this does the same thing whether the database
-- is at the original Hostinger baseline, part-way through the earlier
-- hand-written migrations, or already fully up to date: it adds only what is
-- missing and reports what it skipped.
--
-- WHAT IT DOES NOT DO: it never drops a table, column or index, never retypes a
-- column in a way that discards values, and rewrites existing rows only in
-- conditional steps that its section describes. For example:
--   * Tenant.clientFieldsSeededAt  — stamped only where it is NULL and the
--                                    tenant already has role-carrying fields;
--   * ClientForm.settings          — set to '{}' only where it is NULL, so the
--                                    column can become NOT NULL;
--   * Interaction.occurredAt and   — filled only where occurredAt is NULL
--     Interaction.resultId           (section 23, FR-ACT-07).
--   * Quotation.number             — given only where it is NULL, and the
--                                    year's DocumentSequence moved past it
--                                    (section 25, FR-OFR-08);
--   * Tenant.salesWorkflow         — set to SALES_PROCESS for the
--                                    wellness-albania workspace only (25, D6).
--
-- It replaces running these twenty-eight by hand, in this order (the order matters —
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
--  19. mysql_migration_m2_pricing_config.sql
--  20. mysql_migration_m2_services_offer_settings.sql
--  21. mysql_migration_m2_sales_script.sql
--  22. mysql_migration_m2_deals.sql
--  23. mysql_migration_m2_activities.sql
--  24. mysql_migration_m2_draft_offers.sql
--  25. mysql_migration_m2_offer_documents.sql
--  26. mysql_migration_m2_discount_approvals.sql
--  27. mysql_migration_m2_follow_ups.sql
--  28. mysql_migration_m3_contracts_permissions.sql
--  29. mysql_migration_m3_contract_settings.sql
--  30. mysql_migration_m3_contracts.sql
--  31. mysql_migration_m3_contract_documents.sql
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
-- 19. Milestone 2 pricing configuration (M2 Slice 3)
-- ---------------------------------------------------------------
-- Tables are created with their final shape; a database that already has
-- them skips straight to the seed, which is also guarded.
CREATE TABLE IF NOT EXISTS `PricingSettings` (
    `tenantId` VARCHAR(191) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'EUR',
    `discountCapPercent` DECIMAL(7, 2) NOT NULL DEFAULT 10,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`tenantId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `EmployeeBand` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `minEmployees` INTEGER NOT NULL,
    `maxEmployees` INTEGER NOT NULL,
    `baseFee` DECIMAL(12, 2) NOT NULL,
    `perEmployeeFee` DECIMAL(12, 2) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `EmployeeBand_tenantId_minEmployees_idx`(`tenantId`, `minEmployees`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `RiskSurcharge` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `riskLevelId` VARCHAR(191) NOT NULL,
    `percent` DECIMAL(7, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `RiskSurcharge_riskLevelId_idx`(`riskLevelId`),
    UNIQUE INDEX `RiskSurcharge_tenantId_riskLevelId_key`(`tenantId`, `riskLevelId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `VisitFrequency` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `nameSq` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(191) NULL,
    `visitsPerYear` INTEGER NULL,
    `pricingType` VARCHAR(191) NOT NULL,
    `value` DECIMAL(12, 2) NOT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `VisitFrequency_tenantId_order_idx`(`tenantId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `PriceZone` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `nameSq` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(191) NULL,
    `surchargePercent` DECIMAL(7, 2) NOT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PriceZone_tenantId_order_idx`(`tenantId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `PriceZoneCity` (
    `zoneId` VARCHAR(191) NOT NULL,
    `cityId` VARCHAR(191) NOT NULL,

    INDEX `PriceZoneCity_cityId_idx`(`cityId`),
    PRIMARY KEY (`zoneId`, `cityId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=0;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PricingSettings' AND CONSTRAINT_NAME = 'PricingSettings_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PricingSettings` ADD CONSTRAINT `PricingSettings_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: PricingSettings.PricingSettings_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'EmployeeBand' AND CONSTRAINT_NAME = 'EmployeeBand_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `EmployeeBand` ADD CONSTRAINT `EmployeeBand_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: EmployeeBand.EmployeeBand_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'RiskSurcharge' AND CONSTRAINT_NAME = 'RiskSurcharge_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `RiskSurcharge` ADD CONSTRAINT `RiskSurcharge_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: RiskSurcharge.RiskSurcharge_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'RiskSurcharge' AND CONSTRAINT_NAME = 'RiskSurcharge_riskLevelId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `RiskSurcharge` ADD CONSTRAINT `RiskSurcharge_riskLevelId_fkey` FOREIGN KEY (`riskLevelId`) REFERENCES `RiskLevel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: RiskSurcharge.RiskSurcharge_riskLevelId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'VisitFrequency' AND CONSTRAINT_NAME = 'VisitFrequency_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `VisitFrequency` ADD CONSTRAINT `VisitFrequency_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: VisitFrequency.VisitFrequency_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PriceZone' AND CONSTRAINT_NAME = 'PriceZone_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PriceZone` ADD CONSTRAINT `PriceZone_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: PriceZone.PriceZone_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PriceZoneCity' AND CONSTRAINT_NAME = 'PriceZoneCity_zoneId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PriceZoneCity` ADD CONSTRAINT `PriceZoneCity_zoneId_fkey` FOREIGN KEY (`zoneId`) REFERENCES `PriceZone`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: PriceZoneCity.PriceZoneCity_zoneId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PriceZoneCity' AND CONSTRAINT_NAME = 'PriceZoneCity_cityId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PriceZoneCity` ADD CONSTRAINT `PriceZoneCity_cityId_fkey` FOREIGN KEY (`cityId`) REFERENCES `City`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: PriceZoneCity.PriceZoneCity_cityId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- PriceZoneCity's City key cascades (migration 20260930210000_m2_price_zone_city_cascade): a database that
-- received the earlier RESTRICT key gets it dropped and re-added.
SET @restrict := (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'PriceZoneCity' AND CONSTRAINT_NAME = 'PriceZoneCity_cityId_fkey' AND DELETE_RULE <> 'CASCADE');
SET @sql := IF(@restrict > 0, 'ALTER TABLE `PriceZoneCity` DROP FOREIGN KEY `PriceZoneCity_cityId_fkey`', 'SELECT ''skip: PriceZoneCity_cityId_fkey already cascades'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PriceZoneCity' AND CONSTRAINT_NAME = 'PriceZoneCity_cityId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PriceZoneCity` ADD CONSTRAINT `PriceZoneCity_cityId_fkey` FOREIGN KEY (`cityId`) REFERENCES `City`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: PriceZoneCity.PriceZoneCity_cityId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET FOREIGN_KEY_CHECKS=1;

-- Vorë joins the Tiranë area (M1 city list), so the "Kamëz and Vorë" price
-- zone can be seeded. Every workspace with a Tiranë area and no Vorë in it.
INSERT INTO `City` (`id`, `tenantId`, `areaId`, `nameSq`, `nameEn`, `order`, `updatedAt`)
SELECT UUID(), a.tenantId, a.id, v.namesq, v.nameen, v.ord, NOW(3)
FROM `Area` a
JOIN (
  SELECT 'Tiranë' AS areanamesq, 'Vorë' AS namesq, 'Vorë' AS nameen, 4 AS ord
) v ON a.`nameSq` = v.areanamesq
WHERE NOT EXISTS (SELECT 1 FROM `City` c WHERE c.areaId = a.id AND c.`nameSq` = v.namesq);

-- Seed (Q1, Q2, Q3, Q4, Q7): the defaults in src/pricing/domain/DefaultPricing.ts,
-- for every workspace that has none yet. Same values as the Postgres migration.
INSERT INTO `PricingSettings` (`tenantId`, `currency`, `discountCapPercent`, `updatedAt`)
SELECT t.id, 'EUR', 10.00, NOW(3)
FROM `Tenant` t
WHERE NOT EXISTS (SELECT 1 FROM `PricingSettings` p WHERE p.tenantId = t.id);

INSERT INTO `EmployeeBand` (`id`, `tenantId`, `minEmployees`, `maxEmployees`, `baseFee`, `perEmployeeFee`, `updatedAt`)
SELECT UUID(), t.id, v.minemployees, v.maxemployees, v.basefee, v.peremployeefee, NOW(3)
FROM `Tenant` t
CROSS JOIN (
  SELECT 1 AS minemployees, 10 AS maxemployees, 30.00 AS basefee, 8.00 AS peremployeefee
) v
WHERE NOT EXISTS (SELECT 1 FROM `EmployeeBand` b WHERE b.tenantId = t.id);

INSERT INTO `RiskSurcharge` (`id`, `tenantId`, `riskLevelId`, `percent`, `updatedAt`)
SELECT UUID(), t.id, r.id, v.percent, NOW(3)
FROM `Tenant` t
CROSS JOIN (
  SELECT 1 AS risklevel, 0.00 AS percent
  UNION ALL
  SELECT 2, 10.00
  UNION ALL
  SELECT 3, 20.00
) v
JOIN `RiskLevel` r ON r.tenantId = t.id AND r.`level` = v.risklevel
WHERE NOT EXISTS (SELECT 1 FROM `RiskSurcharge` s WHERE s.tenantId = t.id);

INSERT INTO `VisitFrequency` (`id`, `tenantId`, `nameSq`, `nameEn`, `visitsPerYear`, `pricingType`, `value`, `order`, `updatedAt`)
SELECT UUID(), t.id, v.namesq, v.nameen, v.visitsperyear, v.pricingtype, v.value, v.ord, NOW(3)
FROM `Tenant` t
CROSS JOIN (
  SELECT '1 herë në vit' AS namesq, 'Once a year' AS nameen, 1 AS visitsperyear, 'PERCENT' AS pricingtype, 0.00 AS value, 1 AS ord
  UNION ALL
  SELECT '2 herë në vit', 'Twice a year', 2, 'PERCENT', 20.00, 2
  UNION ALL
  SELECT '4 herë në vit', '4 times a year', 4, 'PERCENT', 35.00, 3
  UNION ALL
  SELECT '6 herë në vit', '6 times a year', 6, 'PERCENT', 50.00, 4
  UNION ALL
  SELECT 'Çdo muaj', 'Monthly', 12, 'PERCENT', 100.00, 5
  UNION ALL
  SELECT 'Sipas nevojës', 'Ad hoc', NULL, 'FIXED', 15.00, 6
) v
WHERE NOT EXISTS (SELECT 1 FROM `VisitFrequency` f WHERE f.tenantId = t.id);

INSERT INTO `PriceZone` (`id`, `tenantId`, `nameSq`, `nameEn`, `surchargePercent`, `order`, `updatedAt`)
SELECT UUID(), t.id, v.namesq, v.nameen, v.surchargepercent, v.ord, NOW(3)
FROM `Tenant` t
CROSS JOIN (
  SELECT 'Tirana qendër' AS namesq, 'Tirana centre' AS nameen, 0.00 AS surchargepercent, 1 AS ord
  UNION ALL
  SELECT 'Tirana periferi', 'Tirana suburbs', 15.00, 2
  UNION ALL
  SELECT 'Kamëz dhe Vorë', 'Kamëz and Vorë', 30.00, 3
  UNION ALL
  SELECT 'Elbasan dhe Durrës', 'Elbasan and Durrës', 100.00, 4
) v
WHERE NOT EXISTS (SELECT 1 FROM `PriceZone` z WHERE z.tenantId = t.id);

-- Cities are matched by area and city name, since "Tiranë" is unique only
-- within its area. A workspace whose zones already have cities keeps them.
INSERT INTO `PriceZoneCity` (`zoneId`, `cityId`)
SELECT z.id, c.id
FROM (
  SELECT 'Tirana qendër' AS zonenamesq, 'Tiranë' AS areanamesq, 'Tiranë' AS citynamesq
  UNION ALL
  SELECT 'Tirana periferi', 'Tiranë', 'Tiranë'
  UNION ALL
  SELECT 'Kamëz dhe Vorë', 'Tiranë', 'Kamëz'
  UNION ALL
  SELECT 'Kamëz dhe Vorë', 'Tiranë', 'Vorë'
  UNION ALL
  SELECT 'Elbasan dhe Durrës', 'Elbasan', 'Elbasan'
  UNION ALL
  SELECT 'Elbasan dhe Durrës', 'Durrës', 'Durrës'
) v
JOIN `PriceZone` z ON z.`nameSq` = v.zonenamesq
JOIN `Area` a ON a.tenantId = z.tenantId AND a.`nameSq` = v.areanamesq
JOIN `City` c ON c.areaId = a.id AND c.`nameSq` = v.citynamesq
WHERE NOT EXISTS (
  SELECT 1 FROM `PriceZoneCity` zc JOIN `PriceZone` oz ON oz.id = zc.zoneId WHERE oz.tenantId = z.tenantId
);

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20260930200000_m2_pricing_config', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20260930200000_m2_pricing_config'
);

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20260930210000_m2_price_zone_city_cascade', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20260930210000_m2_price_zone_city_cascade'
);

-- ---------------------------------------------------------------
-- 20. Milestone 2 services, packages and offer settings (M2 Slice 4)
-- ---------------------------------------------------------------
-- Run before the columns are added: whether this database is getting the
-- offer settings for the first time. Only then are they seeded, so a second
-- run never refills a value the Administrator has since cleared.
SET @offerSettingsFresh := (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PricingSettings' AND COLUMN_NAME = 'offerNumberPrefix');

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PricingSettings' AND COLUMN_NAME = 'offerValidityDays');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PricingSettings` ADD COLUMN `offerValidityDays` INTEGER NOT NULL DEFAULT 30', 'SELECT ''skip: PricingSettings.offerValidityDays'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PricingSettings' AND COLUMN_NAME = 'contractMonthsDefault');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PricingSettings` ADD COLUMN `contractMonthsDefault` INTEGER NOT NULL DEFAULT 12', 'SELECT ''skip: PricingSettings.contractMonthsDefault'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PricingSettings' AND COLUMN_NAME = 'offerNumberPrefix');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PricingSettings` ADD COLUMN `offerNumberPrefix` VARCHAR(191) NOT NULL DEFAULT ''OF''', 'SELECT ''skip: PricingSettings.offerNumberPrefix'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PricingSettings' AND COLUMN_NAME = 'companyName');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PricingSettings` ADD COLUMN `companyName` VARCHAR(191) NULL', 'SELECT ''skip: PricingSettings.companyName'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PricingSettings' AND COLUMN_NAME = 'nipt');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PricingSettings` ADD COLUMN `nipt` VARCHAR(191) NULL', 'SELECT ''skip: PricingSettings.nipt'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PricingSettings' AND COLUMN_NAME = 'address');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PricingSettings` ADD COLUMN `address` TEXT NULL', 'SELECT ''skip: PricingSettings.address'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PricingSettings' AND COLUMN_NAME = 'phone');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PricingSettings` ADD COLUMN `phone` VARCHAR(191) NULL', 'SELECT ''skip: PricingSettings.phone'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PricingSettings' AND COLUMN_NAME = 'email');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PricingSettings` ADD COLUMN `email` VARCHAR(191) NULL', 'SELECT ''skip: PricingSettings.email'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PricingSettings' AND COLUMN_NAME = 'website');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PricingSettings` ADD COLUMN `website` VARCHAR(191) NULL', 'SELECT ''skip: PricingSettings.website'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PricingSettings' AND COLUMN_NAME = 'bankDetails');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PricingSettings` ADD COLUMN `bankDetails` TEXT NULL', 'SELECT ''skip: PricingSettings.bankDetails'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PricingSettings' AND COLUMN_NAME = 'introSq');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PricingSettings` ADD COLUMN `introSq` JSON NULL', 'SELECT ''skip: PricingSettings.introSq'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PricingSettings' AND COLUMN_NAME = 'introEn');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PricingSettings` ADD COLUMN `introEn` JSON NULL', 'SELECT ''skip: PricingSettings.introEn'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PricingSettings' AND COLUMN_NAME = 'termsSq');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PricingSettings` ADD COLUMN `termsSq` JSON NULL', 'SELECT ''skip: PricingSettings.termsSq'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PricingSettings' AND COLUMN_NAME = 'termsEn');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PricingSettings` ADD COLUMN `termsEn` JSON NULL', 'SELECT ''skip: PricingSettings.termsEn'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PricingSettings' AND COLUMN_NAME = 'closingSq');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PricingSettings` ADD COLUMN `closingSq` JSON NULL', 'SELECT ''skip: PricingSettings.closingSq'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PricingSettings' AND COLUMN_NAME = 'closingEn');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PricingSettings` ADD COLUMN `closingEn` JSON NULL', 'SELECT ''skip: PricingSettings.closingEn'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `Service` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `nameSq` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(191) NULL,
    `descriptionSq` TEXT NULL,
    `descriptionEn` TEXT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Service_tenantId_order_idx`(`tenantId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `ServicePackage` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `nameSq` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(191) NULL,
    `descriptionSq` TEXT NULL,
    `descriptionEn` TEXT NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `order` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ServicePackage_tenantId_order_idx`(`tenantId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `PackageService` (
    `packageId` VARCHAR(191) NOT NULL,
    `serviceId` VARCHAR(191) NOT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,

    INDEX `PackageService_serviceId_idx`(`serviceId`),
    PRIMARY KEY (`packageId`, `serviceId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=0;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Service' AND CONSTRAINT_NAME = 'Service_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Service` ADD CONSTRAINT `Service_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: Service.Service_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ServicePackage' AND CONSTRAINT_NAME = 'ServicePackage_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `ServicePackage` ADD CONSTRAINT `ServicePackage_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: ServicePackage.ServicePackage_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PackageService' AND CONSTRAINT_NAME = 'PackageService_packageId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PackageService` ADD CONSTRAINT `PackageService_packageId_fkey` FOREIGN KEY (`packageId`) REFERENCES `ServicePackage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: PackageService.PackageService_packageId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PackageService' AND CONSTRAINT_NAME = 'PackageService_serviceId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `PackageService` ADD CONSTRAINT `PackageService_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `Service`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: PackageService.PackageService_serviceId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET FOREIGN_KEY_CHECKS=1;

-- Seed (Q5, Q6, Q9, Q11): the defaults in
-- src/pricing/domain/DefaultOfferSettings.ts. Same values as the Postgres
-- migration. The numbers came with their column defaults above; the company
-- name starts as the workspace name.
UPDATE `PricingSettings` p
JOIN `Tenant` t ON t.id = p.tenantId
SET p.`companyName` = t.`name`,
    p.`introSq` = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Ju falënderojmë për interesin tuaj. Më poshtë gjeni ofertën tonë për shërbimet e sigurisë dhe shëndetit në punë."}]}]}',
    p.`introEn` = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Thank you for your interest. Below is our offer for health and safety services at work."}]}]}',
    p.`termsSq` = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Çmimet janë mujore, në EUR."}]},{"type":"paragraph","content":[{"type":"text","text":"TVSH nuk përfshihet."}]}]}',
    p.`termsEn` = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Prices are monthly, in EUR."}]},{"type":"paragraph","content":[{"type":"text","text":"VAT not included."}]}]}',
    p.`closingSq` = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Mbetemi në dispozicion për çdo pyetje."}]}]}',
    p.`closingEn` = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"We remain at your disposal for any questions."}]}]}'
WHERE @offerSettingsFresh = 1;

INSERT INTO `Service` (`id`, `tenantId`, `nameSq`, `nameEn`, `descriptionSq`, `descriptionEn`, `order`, `updatedAt`)
SELECT UUID(), t.id, v.namesq, v.nameen, v.descriptionsq, v.descriptionen, v.ord, NOW(3)
FROM `Tenant` t
CROSS JOIN (
  SELECT 'Vlerësimi i riskut' AS namesq, 'Risk assessment' AS nameen, 'Vlerësimi i rreziqeve për sigurinë dhe shëndetin në vendin e punës.' AS descriptionsq, 'Assessment of the health and safety risks at the workplace.' AS descriptionen, 1 AS ord
  UNION ALL
  SELECT 'Vizita mjekësore në punë', 'Occupational health visits', 'Vizitat e mjekut të punës në objekt, sipas frekuencës së zgjedhur.', 'Visits of the occupational physician on site, at the chosen frequency.', 2
  UNION ALL
  SELECT 'Trajnim për sigurinë dhe shëndetin në punë', 'Health and safety training', 'Trajnimi i punonjësve për sigurinë dhe shëndetin në punë.', 'Training of the employees in health and safety at work.', 3
) v
WHERE NOT EXISTS (SELECT 1 FROM `Service` s WHERE s.tenantId = t.id);

INSERT INTO `ServicePackage` (`id`, `tenantId`, `nameSq`, `nameEn`, `descriptionSq`, `descriptionEn`, `isDefault`, `order`, `updatedAt`)
SELECT UUID(), t.id, 'Standart', 'Standard', 'Paketa standarde e shërbimeve.', 'The standard package of services.', true, 1, NOW(3)
FROM `Tenant` t
WHERE NOT EXISTS (SELECT 1 FROM `ServicePackage` sp WHERE sp.tenantId = t.id);

-- The default package holds every default service, in order. A package that
-- already has services keeps them.
INSERT INTO `PackageService` (`packageId`, `serviceId`, `order`)
SELECT sp.id, s.id, v.ord
FROM (
  SELECT 'Vlerësimi i riskut' AS servicenamesq, 1 AS ord
  UNION ALL
  SELECT 'Vizita mjekësore në punë', 2
  UNION ALL
  SELECT 'Trajnim për sigurinë dhe shëndetin në punë', 3
) v
JOIN `ServicePackage` sp ON sp.`nameSq` = 'Standart' AND sp.`isDefault` = true
JOIN `Service` s ON s.tenantId = sp.tenantId AND s.`nameSq` = v.servicenamesq
WHERE NOT EXISTS (SELECT 1 FROM `PackageService` ps WHERE ps.packageId = sp.id);

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20261001100000_m2_services_offer_settings', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20261001100000_m2_services_offer_settings'
);

-- ---------------------------------------------------------------
-- 21. Milestone 2 sales script (M2 Slice 5)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `SalesScript` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `liveSlot` VARCHAR(191) NULL,
    `contentSq` JSON NOT NULL,
    `contentEn` JSON NULL,
    `createdByUserId` VARCHAR(191) NULL,
    `publishedAt` DATETIME(3) NULL,
    `publishedByUserId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SalesScript_createdByUserId_idx`(`createdByUserId`),
    INDEX `SalesScript_publishedByUserId_idx`(`publishedByUserId`),
    UNIQUE INDEX `SalesScript_tenantId_version_key`(`tenantId`, `version`),
    UNIQUE INDEX `SalesScript_tenantId_liveSlot_key`(`tenantId`, `liveSlot`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=0;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SalesScript' AND CONSTRAINT_NAME = 'SalesScript_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `SalesScript` ADD CONSTRAINT `SalesScript_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: SalesScript.SalesScript_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SalesScript' AND CONSTRAINT_NAME = 'SalesScript_createdByUserId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `SalesScript` ADD CONSTRAINT `SalesScript_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT ''skip: SalesScript.SalesScript_createdByUserId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SalesScript' AND CONSTRAINT_NAME = 'SalesScript_publishedByUserId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `SalesScript` ADD CONSTRAINT `SalesScript_publishedByUserId_fkey` FOREIGN KEY (`publishedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT ''skip: SalesScript.SalesScript_publishedByUserId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET FOREIGN_KEY_CHECKS=1;

-- Seed: the placeholder script in src/salesScript/domain/DefaultSalesScript.ts,
-- published as version 1 for every workspace that has no script yet. Same
-- JSON as the Postgres migration.
INSERT INTO `SalesScript` (`id`, `tenantId`, `version`, `status`, `liveSlot`, `contentSq`, `contentEn`, `publishedAt`, `updatedAt`)
SELECT UUID(), t.id, 1, 'PUBLISHED', 'PUBLISHED',
    '{"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Hapja"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Prezantoni veten dhe Wellness Albania, dhe pyesni nëse është një moment i përshtatshëm për të folur."}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Zbulimi i nevojave"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Pyesni për aktivitetin e kompanisë, numrin e punonjësve dhe si e menaxhojnë sot sigurinë në punë."}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Pyetje për çmimin"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Konfirmoni numrin e punonjësve, llojin e biznesit, frekuencën e vizitave dhe qytetin para se të llogaritni çmimin."}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Kundërshtimet"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Dëgjoni kundërshtimin deri në fund, pastaj shpjegoni vlerën e shërbimit për kompaninë."}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Mbyllja"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Përmblidhni ofertën dhe bini dakord për hapin e radhës dhe datën e ndjekjes."}]}]}]}]}',
    '{"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Opening"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Introduce yourself and Wellness Albania, and ask whether this is a good moment to talk."}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Needs discovery"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Ask about the company activity, the number of employees and how they handle safety at work today."}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Pricing questions"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Confirm the number of employees, business type, visit frequency and city before calculating the price."}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Objections"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Hear the objection out, then explain the value of the service for the company."}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Closing"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Summarise the offer and agree the next step and the follow-up date."}]}]}]}]}',
    NOW(3), NOW(3)
FROM `Tenant` t
WHERE NOT EXISTS (SELECT 1 FROM `SalesScript` s WHERE s.tenantId = t.id);

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20261001120000_m2_sales_script', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20261001120000_m2_sales_script'
);

-- ---------------------------------------------------------------
-- 22. Milestone 2 deals and pipeline (M2 Slice 6)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `Deal` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `ownerUserId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NULL,
    `stageKey` VARCHAR(191) NOT NULL,
    `expectedCloseDate` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `createdByUserId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `closedAt` DATETIME(3) NULL,
    `deletedAt` DATETIME(3) NULL,
    `wonAt` DATETIME(3) NULL,
    `lostAt` DATETIME(3) NULL,
    `lostReasonId` VARCHAR(191) NULL,
    `lostNote` TEXT NULL,
    `agreedMonthlyPrice` DECIMAL(12, 2) NULL,
    `agreedAnnualValue` DECIMAL(12, 2) NULL,
    `packageId` VARCHAR(191) NULL,
    `wonQuotationId` VARCHAR(191) NULL,

    INDEX `Deal_tenantId_ownerUserId_stageKey_idx`(`tenantId`, `ownerUserId`, `stageKey`),
    INDEX `Deal_tenantId_clientId_idx`(`tenantId`, `clientId`),
    INDEX `Deal_tenantId_stageKey_updatedAt_idx`(`tenantId`, `stageKey`, `updatedAt`),
    INDEX `Deal_ownerUserId_idx`(`ownerUserId`),
    INDEX `Deal_createdByUserId_idx`(`createdByUserId`),
    INDEX `Deal_lostReasonId_idx`(`lostReasonId`),
    INDEX `Deal_packageId_idx`(`packageId`),
    INDEX `Deal_wonQuotationId_idx`(`wonQuotationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `DealStageHistory` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `dealId` VARCHAR(191) NOT NULL,
    `fromStage` VARCHAR(191) NULL,
    `toStage` VARCHAR(191) NOT NULL,
    `changedByUserId` VARCHAR(191) NULL,
    `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `note` TEXT NULL,

    INDEX `DealStageHistory_tenantId_dealId_at_idx`(`tenantId`, `dealId`, `at`),
    INDEX `DealStageHistory_dealId_idx`(`dealId`),
    INDEX `DealStageHistory_changedByUserId_idx`(`changedByUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=0;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Deal' AND CONSTRAINT_NAME = 'Deal_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Deal` ADD CONSTRAINT `Deal_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: Deal.Deal_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Deal' AND CONSTRAINT_NAME = 'Deal_clientId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Deal` ADD CONSTRAINT `Deal_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Deal.Deal_clientId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Deal' AND CONSTRAINT_NAME = 'Deal_ownerUserId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Deal` ADD CONSTRAINT `Deal_ownerUserId_fkey` FOREIGN KEY (`ownerUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Deal.Deal_ownerUserId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Deal' AND CONSTRAINT_NAME = 'Deal_createdByUserId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Deal` ADD CONSTRAINT `Deal_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Deal.Deal_createdByUserId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Deal' AND CONSTRAINT_NAME = 'Deal_lostReasonId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Deal` ADD CONSTRAINT `Deal_lostReasonId_fkey` FOREIGN KEY (`lostReasonId`) REFERENCES `LostReason`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Deal.Deal_lostReasonId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Deal' AND CONSTRAINT_NAME = 'Deal_packageId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Deal` ADD CONSTRAINT `Deal_packageId_fkey` FOREIGN KEY (`packageId`) REFERENCES `ServicePackage`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Deal.Deal_packageId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Deal' AND CONSTRAINT_NAME = 'Deal_wonQuotationId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Deal` ADD CONSTRAINT `Deal_wonQuotationId_fkey` FOREIGN KEY (`wonQuotationId`) REFERENCES `Quotation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Deal.Deal_wonQuotationId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DealStageHistory' AND CONSTRAINT_NAME = 'DealStageHistory_dealId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `DealStageHistory` ADD CONSTRAINT `DealStageHistory_dealId_fkey` FOREIGN KEY (`dealId`) REFERENCES `Deal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: DealStageHistory.DealStageHistory_dealId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DealStageHistory' AND CONSTRAINT_NAME = 'DealStageHistory_changedByUserId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `DealStageHistory` ADD CONSTRAINT `DealStageHistory_changedByUserId_fkey` FOREIGN KEY (`changedByUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: DealStageHistory.DealStageHistory_changedByUserId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET FOREIGN_KEY_CHECKS=1;

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20261001140000_m2_deals', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20261001140000_m2_deals'
);

-- ---------------------------------------------------------------
-- 23. Milestone 2 activities (M2 Slice 7)
-- ---------------------------------------------------------------

SELECT '23. Milestone 2 activities' AS step, NOW() AS at;

CREATE TABLE IF NOT EXISTS `ActivityResult` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `nameSq` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(191) NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ActivityResult_tenantId_order_idx`(`tenantId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Interaction' AND COLUMN_NAME = 'occurredAt');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Interaction` ADD COLUMN `occurredAt` DATETIME(3) NULL', 'SELECT ''skip: Interaction.occurredAt'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Interaction' AND COLUMN_NAME = 'contactPersonId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Interaction` ADD COLUMN `contactPersonId` VARCHAR(191) NULL', 'SELECT ''skip: Interaction.contactPersonId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Interaction' AND COLUMN_NAME = 'dealId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Interaction` ADD COLUMN `dealId` VARCHAR(191) NULL', 'SELECT ''skip: Interaction.dealId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Interaction' AND COLUMN_NAME = 'resultId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Interaction` ADD COLUMN `resultId` VARCHAR(191) NULL', 'SELECT ''skip: Interaction.resultId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Interaction' AND COLUMN_NAME = 'clientFeedback');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Interaction` ADD COLUMN `clientFeedback` TEXT NULL', 'SELECT ''skip: Interaction.clientFeedback'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Interaction' AND COLUMN_NAME = 'nextAction');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Interaction` ADD COLUMN `nextAction` TEXT NULL', 'SELECT ''skip: Interaction.nextAction'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Interaction' AND COLUMN_NAME = 'updatedAt');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Interaction` ADD COLUMN `updatedAt` DATETIME(3) NULL', 'SELECT ''skip: Interaction.updatedAt'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Interaction' AND COLUMN_NAME = 'updatedByUserId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Interaction` ADD COLUMN `updatedByUserId` VARCHAR(191) NULL', 'SELECT ''skip: Interaction.updatedByUserId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Interaction' AND INDEX_NAME = 'Interaction_tenantId_clientId_occurredAt_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Interaction_tenantId_clientId_occurredAt_idx` ON `Interaction`(`tenantId`, `clientId`, `occurredAt`)', 'SELECT ''skip: Interaction_tenantId_clientId_occurredAt_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Interaction' AND INDEX_NAME = 'Interaction_tenantId_dealId_occurredAt_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Interaction_tenantId_dealId_occurredAt_idx` ON `Interaction`(`tenantId`, `dealId`, `occurredAt`)', 'SELECT ''skip: Interaction_tenantId_dealId_occurredAt_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Interaction' AND INDEX_NAME = 'Interaction_contactPersonId_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Interaction_contactPersonId_idx` ON `Interaction`(`contactPersonId`)', 'SELECT ''skip: Interaction_contactPersonId_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Interaction' AND INDEX_NAME = 'Interaction_dealId_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Interaction_dealId_idx` ON `Interaction`(`dealId`)', 'SELECT ''skip: Interaction_dealId_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Interaction' AND INDEX_NAME = 'Interaction_resultId_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Interaction_resultId_idx` ON `Interaction`(`resultId`)', 'SELECT ''skip: Interaction_resultId_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Interaction' AND INDEX_NAME = 'Interaction_updatedByUserId_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Interaction_updatedByUserId_idx` ON `Interaction`(`updatedByUserId`)', 'SELECT ''skip: Interaction_updatedByUserId_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=0;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Interaction' AND CONSTRAINT_NAME = 'Interaction_contactPersonId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Interaction` ADD CONSTRAINT `Interaction_contactPersonId_fkey` FOREIGN KEY (`contactPersonId`) REFERENCES `ContactPerson`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Interaction.Interaction_contactPersonId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Interaction' AND CONSTRAINT_NAME = 'Interaction_dealId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Interaction` ADD CONSTRAINT `Interaction_dealId_fkey` FOREIGN KEY (`dealId`) REFERENCES `Deal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Interaction.Interaction_dealId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Interaction' AND CONSTRAINT_NAME = 'Interaction_resultId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Interaction` ADD CONSTRAINT `Interaction_resultId_fkey` FOREIGN KEY (`resultId`) REFERENCES `ActivityResult`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Interaction.Interaction_resultId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Interaction' AND CONSTRAINT_NAME = 'Interaction_updatedByUserId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Interaction` ADD CONSTRAINT `Interaction_updatedByUserId_fkey` FOREIGN KEY (`updatedByUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Interaction.Interaction_updatedByUserId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ActivityResult' AND CONSTRAINT_NAME = 'ActivityResult_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `ActivityResult` ADD CONSTRAINT `ActivityResult_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: ActivityResult.ActivityResult_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET FOREIGN_KEY_CHECKS=1;

-- Data (FR-ACT-07, NFR-OPS-02), the same as the Postgres migration. Only
-- workspaces with no activity results yet get the list: the defaults from
-- src/lookups/domain/DefaultLookups.ts (Q14), then every legacy
-- OutcomeCategory label that is not already one of them. A copied category
-- keeps its id, so interactions map by key, not by label. A legacy row is one
-- with no `occurredAt`; it gets its result first and its date last.
SELECT 'before' AS m2_activities,
  (SELECT COUNT(*) FROM `Interaction`) AS interactions,
  (SELECT COUNT(*) FROM `Interaction` WHERE `occurredAt` IS NULL) AS without_occurred_at,
  (SELECT COUNT(*) FROM `OutcomeCategory`) AS outcome_categories,
  (SELECT COUNT(*) FROM `ActivityResult`) AS activity_results;

DROP TEMPORARY TABLE IF EXISTS `_m2_activities_tenant`;
CREATE TEMPORARY TABLE `_m2_activities_tenant` AS
SELECT t.id FROM `Tenant` t
WHERE NOT EXISTS (SELECT 1 FROM `ActivityResult` a WHERE a.tenantId = t.id);

INSERT INTO `ActivityResult` (`id`, `tenantId`, `nameSq`, `nameEn`, `order`, `updatedAt`)
SELECT UUID(), n.id, v.namesq, v.nameen, v.ord, NOW(3)
FROM `_m2_activities_tenant` n
CROSS JOIN (
  SELECT 'U kontaktua – i interesuar' AS namesq, 'Reached – interested' AS nameen, 1 AS ord
  UNION ALL
  SELECT 'U kontaktua – jo i interesuar', 'Reached – not interested', 2
  UNION ALL
  SELECT 'Nuk u kontaktua', 'Not reached', 3
  UNION ALL
  SELECT 'Telefono më vonë', 'Call back later', 4
  UNION ALL
  SELECT 'U caktua takim', 'Meeting agreed', 5
  UNION ALL
  SELECT 'Kërkoi ofertë', 'Offer requested', 6
) v;

INSERT INTO `ActivityResult` (`id`, `tenantId`, `nameSq`, `nameEn`, `order`, `updatedAt`)
SELECT o.id, o.tenantId, o.label, NULL,
       6 + ROW_NUMBER() OVER (PARTITION BY o.tenantId ORDER BY o.label), NOW(3)
FROM `OutcomeCategory` o
JOIN `_m2_activities_tenant` n ON n.id = o.tenantId
WHERE NOT EXISTS (SELECT 1 FROM `ActivityResult` a WHERE a.tenantId = o.tenantId AND a.nameSq = o.label)
  AND NOT EXISTS (SELECT 1 FROM `ActivityResult` a WHERE a.id = o.id);

UPDATE `Interaction` i
SET i.resultId = COALESCE(
  (SELECT a.id FROM `ActivityResult` a
    WHERE a.id = i.outcomeCategoryId AND a.tenantId = i.tenantId),
  (SELECT a.id FROM `ActivityResult` a
    JOIN `OutcomeCategory` o ON o.id = i.outcomeCategoryId
    WHERE a.tenantId = i.tenantId AND a.nameSq = o.label
    ORDER BY a.`order` LIMIT 1)
)
WHERE i.occurredAt IS NULL AND i.resultId IS NULL AND i.outcomeCategoryId IS NOT NULL;

UPDATE `Interaction` SET `occurredAt` = `createdAt` WHERE `occurredAt` IS NULL;

DROP TEMPORARY TABLE IF EXISTS `_m2_activities_tenant`;

SELECT 'after' AS m2_activities,
  (SELECT COUNT(*) FROM `Interaction`) AS interactions,
  (SELECT COUNT(*) FROM `Interaction` WHERE `occurredAt` IS NULL) AS without_occurred_at,
  (SELECT COUNT(*) FROM `Interaction` WHERE `resultId` IS NOT NULL) AS with_result,
  (SELECT COUNT(*) FROM `ActivityResult`) AS activity_results;

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20261002100000_m2_activities', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20261002100000_m2_activities'
);

-- ---------------------------------------------------------------
-- 24. Milestone 2 draft offers (M2 Slice 8)
-- ---------------------------------------------------------------

SELECT '24. Milestone 2 draft offers' AS step, NOW() AS at;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'annualValue');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `annualValue` DECIMAL(12, 2) NULL', 'SELECT ''skip: Quotation.annualValue'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'baseFee');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `baseFee` DECIMAL(12, 2) NULL', 'SELECT ''skip: Quotation.baseFee'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'dealId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `dealId` VARCHAR(191) NULL', 'SELECT ''skip: Quotation.dealId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'discountAmount');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `discountAmount` DECIMAL(12, 2) NULL', 'SELECT ''skip: Quotation.discountAmount'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'discountPercent');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `discountPercent` DECIMAL(7, 2) NULL', 'SELECT ''skip: Quotation.discountPercent'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'employeesPriced');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `employeesPriced` INTEGER NULL', 'SELECT ''skip: Quotation.employeesPriced'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'frequencyId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `frequencyId` VARCHAR(191) NULL', 'SELECT ''skip: Quotation.frequencyId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'language');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `language` VARCHAR(191) NOT NULL DEFAULT ''sq''', 'SELECT ''skip: Quotation.language'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'listPrice');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `listPrice` DECIMAL(12, 2) NULL', 'SELECT ''skip: Quotation.listPrice'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'locationFee');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `locationFee` DECIMAL(12, 2) NULL', 'SELECT ''skip: Quotation.locationFee'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'netMonthlyPrice');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `netMonthlyPrice` DECIMAL(12, 2) NULL', 'SELECT ''skip: Quotation.netMonthlyPrice'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'note');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `note` TEXT NULL', 'SELECT ''skip: Quotation.note'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'packageId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `packageId` VARCHAR(191) NULL', 'SELECT ''skip: Quotation.packageId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'pricePerEmployee');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `pricePerEmployee` DECIMAL(12, 2) NULL', 'SELECT ''skip: Quotation.pricePerEmployee'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'pricingInputs');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `pricingInputs` JSON NULL', 'SELECT ''skip: Quotation.pricingInputs'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'riskFee');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `riskFee` DECIMAL(12, 2) NULL', 'SELECT ''skip: Quotation.riskFee'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'ruleSnapshot');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `ruleSnapshot` JSON NULL', 'SELECT ''skip: Quotation.ruleSnapshot'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'visitFee');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `visitFee` DECIMAL(12, 2) NULL', 'SELECT ''skip: Quotation.visitFee'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'zoneId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `zoneId` VARCHAR(191) NULL', 'SELECT ''skip: Quotation.zoneId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Deal' AND COLUMN_NAME = 'offerAnnualValue');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Deal` ADD COLUMN `offerAnnualValue` DECIMAL(12, 2) NULL', 'SELECT ''skip: Deal.offerAnnualValue'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Deal' AND COLUMN_NAME = 'offerNetMonthlyPrice');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Deal` ADD COLUMN `offerNetMonthlyPrice` DECIMAL(12, 2) NULL', 'SELECT ''skip: Deal.offerNetMonthlyPrice'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


CREATE TABLE IF NOT EXISTS `QuotationService` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `quotationId` VARCHAR(191) NOT NULL,
    `serviceId` VARCHAR(191) NULL,
    `nameSq` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(191) NULL,
    `descriptionSq` TEXT NULL,
    `descriptionEn` TEXT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,

    INDEX `QuotationService_tenantId_quotationId_idx`(`tenantId`, `quotationId`),
    INDEX `QuotationService_quotationId_idx`(`quotationId`),
    INDEX `QuotationService_serviceId_idx`(`serviceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND INDEX_NAME = 'Quotation_tenantId_dealId_status_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Quotation_tenantId_dealId_status_idx` ON `Quotation`(`tenantId`, `dealId`, `status`)', 'SELECT ''skip: Quotation_tenantId_dealId_status_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND INDEX_NAME = 'Quotation_dealId_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Quotation_dealId_idx` ON `Quotation`(`dealId`)', 'SELECT ''skip: Quotation_dealId_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND INDEX_NAME = 'Quotation_packageId_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Quotation_packageId_idx` ON `Quotation`(`packageId`)', 'SELECT ''skip: Quotation_packageId_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND INDEX_NAME = 'Quotation_frequencyId_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Quotation_frequencyId_idx` ON `Quotation`(`frequencyId`)', 'SELECT ''skip: Quotation_frequencyId_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND INDEX_NAME = 'Quotation_zoneId_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Quotation_zoneId_idx` ON `Quotation`(`zoneId`)', 'SELECT ''skip: Quotation_zoneId_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Deal' AND INDEX_NAME = 'Deal_tenantId_stageKey_offerNetMonthlyPrice_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Deal_tenantId_stageKey_offerNetMonthlyPrice_idx` ON `Deal`(`tenantId`, `stageKey`, `offerNetMonthlyPrice`)', 'SELECT ''skip: Deal_tenantId_stageKey_offerNetMonthlyPrice_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=0;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND CONSTRAINT_NAME = 'Quotation_dealId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD CONSTRAINT `Quotation_dealId_fkey` FOREIGN KEY (`dealId`) REFERENCES `Deal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Quotation.Quotation_dealId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND CONSTRAINT_NAME = 'Quotation_packageId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD CONSTRAINT `Quotation_packageId_fkey` FOREIGN KEY (`packageId`) REFERENCES `ServicePackage`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Quotation.Quotation_packageId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND CONSTRAINT_NAME = 'Quotation_frequencyId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD CONSTRAINT `Quotation_frequencyId_fkey` FOREIGN KEY (`frequencyId`) REFERENCES `VisitFrequency`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Quotation.Quotation_frequencyId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND CONSTRAINT_NAME = 'Quotation_zoneId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD CONSTRAINT `Quotation_zoneId_fkey` FOREIGN KEY (`zoneId`) REFERENCES `PriceZone`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Quotation.Quotation_zoneId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'QuotationService' AND CONSTRAINT_NAME = 'QuotationService_quotationId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `QuotationService` ADD CONSTRAINT `QuotationService_quotationId_fkey` FOREIGN KEY (`quotationId`) REFERENCES `Quotation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: QuotationService.QuotationService_quotationId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'QuotationService' AND CONSTRAINT_NAME = 'QuotationService_serviceId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `QuotationService` ADD CONSTRAINT `QuotationService_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `Service`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT ''skip: QuotationService.QuotationService_serviceId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET FOREIGN_KEY_CHECKS=1;

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20261003100000_m2_draft_offers', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20261003100000_m2_draft_offers'
);

-- ---------------------------------------------------------------
-- 25. Milestone 2 offer documents (M2 Slice 9)
-- ---------------------------------------------------------------

SELECT '25. Milestone 2 offer documents' AS step, NOW() AS at;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'contactPersonId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `contactPersonId` VARCHAR(191) NULL', 'SELECT ''skip: Quotation.contactPersonId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'number');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `number` VARCHAR(191) NULL', 'SELECT ''skip: Quotation.number'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'previousVersionId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `previousVersionId` VARCHAR(191) NULL', 'SELECT ''skip: Quotation.previousVersionId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'readyAt');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `readyAt` DATETIME(3) NULL', 'SELECT ''skip: Quotation.readyAt'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'renderSnapshot');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `renderSnapshot` JSON NULL', 'SELECT ''skip: Quotation.renderSnapshot'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'supersededAt');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `supersededAt` DATETIME(3) NULL', 'SELECT ''skip: Quotation.supersededAt'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'validUntil');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `validUntil` DATE NULL', 'SELECT ''skip: Quotation.validUntil'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'version');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1', 'SELECT ''skip: Quotation.version'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `DocumentSequence` (
    `tenantId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `next` INTEGER NOT NULL DEFAULT 1,

    PRIMARY KEY (`tenantId`, `kind`, `year`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND INDEX_NAME = 'Quotation_tenantId_status_validUntil_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Quotation_tenantId_status_validUntil_idx` ON `Quotation`(`tenantId`, `status`, `validUntil`)', 'SELECT ''skip: Quotation_tenantId_status_validUntil_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND INDEX_NAME = 'Quotation_contactPersonId_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Quotation_contactPersonId_idx` ON `Quotation`(`contactPersonId`)', 'SELECT ''skip: Quotation_contactPersonId_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND INDEX_NAME = 'Quotation_previousVersionId_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Quotation_previousVersionId_idx` ON `Quotation`(`previousVersionId`)', 'SELECT ''skip: Quotation_previousVersionId_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND INDEX_NAME = 'Quotation_tenantId_number_version_key');
SET @sql := IF(@needed = 0, 'CREATE UNIQUE INDEX `Quotation_tenantId_number_version_key` ON `Quotation`(`tenantId`, `number`, `version`)', 'SELECT ''skip: Quotation_tenantId_number_version_key'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=0;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND CONSTRAINT_NAME = 'Quotation_contactPersonId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD CONSTRAINT `Quotation_contactPersonId_fkey` FOREIGN KEY (`contactPersonId`) REFERENCES `ContactPerson`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT ''skip: Quotation.Quotation_contactPersonId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND CONSTRAINT_NAME = 'Quotation_previousVersionId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD CONSTRAINT `Quotation_previousVersionId_fkey` FOREIGN KEY (`previousVersionId`) REFERENCES `Quotation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT ''skip: Quotation.Quotation_previousVersionId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DocumentSequence' AND CONSTRAINT_NAME = 'DocumentSequence_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `DocumentSequence` ADD CONSTRAINT `DocumentSequence_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: DocumentSequence.DocumentSequence_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET FOREIGN_KEY_CHECKS=1;

-- Number every quotation that has none (FR-OFR-08, NFR-OPS-02): per tenant
-- and per UTC year of createdAt, in createdAt order, with the tenant's offer
-- prefix (default OF), continuing from the year's counter, which then moves
-- past the last number used. A real table, not a TEMPORARY one: MySQL cannot
-- open a temporary table twice in one statement.
DROP TABLE IF EXISTS `_m2_offer_numbers`;
CREATE TABLE `_m2_offer_numbers` AS
SELECT q.`id`, q.`tenantId`, YEAR(q.`createdAt`) AS `year`,
       ROW_NUMBER() OVER (PARTITION BY q.`tenantId`, YEAR(q.`createdAt`) ORDER BY q.`createdAt`, q.`id`) AS `seq`
FROM `Quotation` q
WHERE q.`number` IS NULL;

INSERT IGNORE INTO `DocumentSequence` (`tenantId`, `kind`, `year`, `next`)
SELECT DISTINCT n.`tenantId`, 'OFFER', n.`year`, 1 FROM `_m2_offer_numbers` n;

UPDATE `Quotation` q
JOIN `_m2_offer_numbers` n ON n.`id` = q.`id`
JOIN `DocumentSequence` s ON s.`tenantId` = n.`tenantId` AND s.`kind` = 'OFFER' AND s.`year` = n.`year`
LEFT JOIN `PricingSettings` ps ON ps.`tenantId` = n.`tenantId`
SET q.`number` = CONCAT(
  COALESCE(ps.`offerNumberPrefix`, 'OF'), '-', n.`year`, '-',
  LPAD(s.`next` - 1 + n.`seq`, GREATEST(4, LENGTH(s.`next` - 1 + n.`seq`)), '0')
);

UPDATE `DocumentSequence` s
JOIN (
  SELECT `tenantId`, `year`, COUNT(*) AS `cnt` FROM `_m2_offer_numbers` GROUP BY `tenantId`, `year`
) c ON s.`tenantId` = c.`tenantId` AND s.`kind` = 'OFFER' AND s.`year` = c.`year`
SET s.`next` = s.`next` + c.`cnt`;

DROP TABLE `_m2_offer_numbers`;

-- Wellness Albania runs the sales process (D6): offers come from deals, and
-- the quotation email and public link are off (FR-OFR-07).
UPDATE `Tenant` SET `salesWorkflow` = 'SALES_PROCESS' WHERE `urlSlug` = 'wellness-albania';

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20261004100000_m2_offer_documents', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20261004100000_m2_offer_documents'
);

-- ---------------------------------------------------------------
--  26. Discount approvals above the cap (M2 Slice 10: FR-DSC-03..12)
-- ---------------------------------------------------------------

SELECT 'm2 discount approvals' AS step, DATABASE() AS db, NOW() AS at;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'NotificationSettings' AND COLUMN_NAME = 'discountApprovalReminderHours');
SET @sql := IF(@needed = 0, 'ALTER TABLE `NotificationSettings` ADD COLUMN `discountApprovalReminderHours` INTEGER NOT NULL DEFAULT 24', 'SELECT ''skip: NotificationSettings.discountApprovalReminderHours'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `DiscountApproval` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `quotationId` VARCHAR(191) NOT NULL,
    `requestedByUserId` VARCHAR(191) NOT NULL,
    `requestedPercent` DECIMAL(7,2) NOT NULL,
    `listPriceAtRequest` DECIMAL(12,2) NOT NULL,
    `approvedPercent` DECIMAL(7,2) NULL,
    `reason` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `decidedByUserId` VARCHAR(191) NULL,
    `decidedAt` DATETIME(3) NULL,
    `comment` TEXT NULL,
    `remindedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DiscountApproval' AND INDEX_NAME = 'DiscountApproval_tenantId_status_createdAt_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `DiscountApproval_tenantId_status_createdAt_idx` ON `DiscountApproval`(`tenantId`, `status`, `createdAt`)', 'SELECT ''skip: DiscountApproval_tenantId_status_createdAt_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DiscountApproval' AND INDEX_NAME = 'DiscountApproval_tenantId_quotationId_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `DiscountApproval_tenantId_quotationId_idx` ON `DiscountApproval`(`tenantId`, `quotationId`)', 'SELECT ''skip: DiscountApproval_tenantId_quotationId_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DiscountApproval' AND INDEX_NAME = 'DiscountApproval_quotationId_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `DiscountApproval_quotationId_idx` ON `DiscountApproval`(`quotationId`)', 'SELECT ''skip: DiscountApproval_quotationId_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=0;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DiscountApproval' AND CONSTRAINT_NAME = 'DiscountApproval_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `DiscountApproval` ADD CONSTRAINT `DiscountApproval_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: DiscountApproval.DiscountApproval_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DiscountApproval' AND CONSTRAINT_NAME = 'DiscountApproval_quotationId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `DiscountApproval` ADD CONSTRAINT `DiscountApproval_quotationId_fkey` FOREIGN KEY (`quotationId`) REFERENCES `Quotation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: DiscountApproval.DiscountApproval_quotationId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DiscountApproval' AND CONSTRAINT_NAME = 'DiscountApproval_requestedByUserId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `DiscountApproval` ADD CONSTRAINT `DiscountApproval_requestedByUserId_fkey` FOREIGN KEY (`requestedByUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: DiscountApproval.DiscountApproval_requestedByUserId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DiscountApproval' AND CONSTRAINT_NAME = 'DiscountApproval_decidedByUserId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `DiscountApproval` ADD CONSTRAINT `DiscountApproval_decidedByUserId_fkey` FOREIGN KEY (`decidedByUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: DiscountApproval.DiscountApproval_decidedByUserId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET FOREIGN_KEY_CHECKS=1;

-- FR-PRC-09: a manual price on a "Price on request" offer. A request now has
-- a kind (DISCOUNT or MANUAL_PRICE); a manual-price request carries a monthly
-- price instead of a percent and a list price, so those become nullable.
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DiscountApproval' AND COLUMN_NAME = 'kind');
SET @sql := IF(@needed = 0, 'ALTER TABLE `DiscountApproval` ADD COLUMN `kind` VARCHAR(191) NOT NULL DEFAULT ''DISCOUNT''', 'SELECT ''skip: DiscountApproval.kind'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DiscountApproval' AND COLUMN_NAME = 'requestedMonthlyPrice');
SET @sql := IF(@needed = 0, 'ALTER TABLE `DiscountApproval` ADD COLUMN `requestedMonthlyPrice` DECIMAL(12,2) NULL', 'SELECT ''skip: DiscountApproval.requestedMonthlyPrice'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DiscountApproval' AND COLUMN_NAME = 'approvedMonthlyPrice');
SET @sql := IF(@needed = 0, 'ALTER TABLE `DiscountApproval` ADD COLUMN `approvedMonthlyPrice` DECIMAL(12,2) NULL', 'SELECT ''skip: DiscountApproval.approvedMonthlyPrice'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DiscountApproval' AND COLUMN_NAME = 'requestedPercent' AND IS_NULLABLE = 'NO');
SET @sql := IF(@needed = 1, 'ALTER TABLE `DiscountApproval` MODIFY `requestedPercent` DECIMAL(7,2) NULL', 'SELECT ''skip: DiscountApproval.requestedPercent nullable'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DiscountApproval' AND COLUMN_NAME = 'listPriceAtRequest' AND IS_NULLABLE = 'NO');
SET @sql := IF(@needed = 1, 'ALTER TABLE `DiscountApproval` MODIFY `listPriceAtRequest` DECIMAL(12,2) NULL', 'SELECT ''skip: DiscountApproval.listPriceAtRequest nullable'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'manualMonthlyPrice');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `manualMonthlyPrice` DECIMAL(12,2) NULL', 'SELECT ''skip: Quotation.manualMonthlyPrice'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND COLUMN_NAME = 'manualPriceReason');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Quotation` ADD COLUMN `manualPriceReason` TEXT NULL', 'SELECT ''skip: Quotation.manualPriceReason'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20261005100000_m2_discount_approvals', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20261005100000_m2_discount_approvals'
);

-- ---------------------------------------------------------------
--  27. Follow-ups (M2 Slice 11: FR-FUP-01..10, FR-DEAL-12; plan D1)
-- ---------------------------------------------------------------

SELECT 'm2 follow-ups' AS step, DATABASE() AS db, NOW() AS at;

-- Appointment becomes the one scheduled-activity entity (plan D1). Existing
-- rows become PLANNED meetings through the column defaults.
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Appointment' AND COLUMN_NAME = 'kind');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Appointment` ADD COLUMN `kind` VARCHAR(191) NOT NULL DEFAULT ''PLANNED''', 'SELECT ''skip: Appointment.kind'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Appointment' AND COLUMN_NAME = 'type');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Appointment` ADD COLUMN `type` VARCHAR(191) NOT NULL DEFAULT ''MEETING''', 'SELECT ''skip: Appointment.type'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Appointment' AND COLUMN_NAME = 'dealId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Appointment` ADD COLUMN `dealId` VARCHAR(191) NULL', 'SELECT ''skip: Appointment.dealId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Appointment' AND COLUMN_NAME = 'contactPersonId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Appointment` ADD COLUMN `contactPersonId` VARCHAR(191) NULL', 'SELECT ''skip: Appointment.contactPersonId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Appointment' AND COLUMN_NAME = 'endAt');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Appointment` ADD COLUMN `endAt` DATETIME(3) NULL', 'SELECT ''skip: Appointment.endAt'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Appointment' AND COLUMN_NAME = 'place');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Appointment` ADD COLUMN `place` TEXT NULL', 'SELECT ''skip: Appointment.place'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Appointment' AND COLUMN_NAME = 'intervalDays');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Appointment` ADD COLUMN `intervalDays` INTEGER NULL', 'SELECT ''skip: Appointment.intervalDays'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Appointment' AND COLUMN_NAME = 'completedInteractionId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Appointment` ADD COLUMN `completedInteractionId` VARCHAR(191) NULL', 'SELECT ''skip: Appointment.completedInteractionId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Appointment' AND COLUMN_NAME = 'cancelReason');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Appointment` ADD COLUMN `cancelReason` TEXT NULL', 'SELECT ''skip: Appointment.cancelReason'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Appointment' AND COLUMN_NAME = 'dueNotifiedAt');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Appointment` ADD COLUMN `dueNotifiedAt` DATETIME(3) NULL', 'SELECT ''skip: Appointment.dueNotifiedAt'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Appointment' AND INDEX_NAME = 'Appointment_completedInteractionId_key');
SET @sql := IF(@needed = 0, 'CREATE UNIQUE INDEX `Appointment_completedInteractionId_key` ON `Appointment`(`completedInteractionId`)', 'SELECT ''skip: Appointment_completedInteractionId_key'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Appointment' AND INDEX_NAME = 'Appointment_tenantId_assignedUserId_status_scheduledAt_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Appointment_tenantId_assignedUserId_status_scheduledAt_idx` ON `Appointment`(`tenantId`, `assignedUserId`, `status`, `scheduledAt`)', 'SELECT ''skip: Appointment_tenantId_assignedUserId_status_scheduledAt_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Appointment' AND INDEX_NAME = 'Appointment_tenantId_dealId_status_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Appointment_tenantId_dealId_status_idx` ON `Appointment`(`tenantId`, `dealId`, `status`)', 'SELECT ''skip: Appointment_tenantId_dealId_status_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Appointment' AND INDEX_NAME = 'Appointment_dealId_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Appointment_dealId_idx` ON `Appointment`(`dealId`)', 'SELECT ''skip: Appointment_dealId_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Appointment' AND INDEX_NAME = 'Appointment_contactPersonId_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Appointment_contactPersonId_idx` ON `Appointment`(`contactPersonId`)', 'SELECT ''skip: Appointment_contactPersonId_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- FR-FUP-09: the due notification and the daily summary.
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'NotificationSettings' AND COLUMN_NAME = 'followUpDueNotificationsEnabled');
SET @sql := IF(@needed = 0, 'ALTER TABLE `NotificationSettings` ADD COLUMN `followUpDueNotificationsEnabled` BOOLEAN NOT NULL DEFAULT true', 'SELECT ''skip: NotificationSettings.followUpDueNotificationsEnabled'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'NotificationSettings' AND COLUMN_NAME = 'followUpDailySummaryEnabled');
SET @sql := IF(@needed = 0, 'ALTER TABLE `NotificationSettings` ADD COLUMN `followUpDailySummaryEnabled` BOOLEAN NOT NULL DEFAULT false', 'SELECT ''skip: NotificationSettings.followUpDailySummaryEnabled'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'NotificationSettings' AND COLUMN_NAME = 'followUpSummarySentOn');
SET @sql := IF(@needed = 0, 'ALTER TABLE `NotificationSettings` ADD COLUMN `followUpSummarySentOn` VARCHAR(191) NULL', 'SELECT ''skip: NotificationSettings.followUpSummarySentOn'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- FR-DEAL-12: days without activity after which a deal is highlighted.
CREATE TABLE IF NOT EXISTS `SalesSettings` (
    `tenantId` VARCHAR(191) NOT NULL,
    `staleDealDays` INTEGER NOT NULL DEFAULT 14,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`tenantId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=0;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Appointment' AND CONSTRAINT_NAME = 'Appointment_dealId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Appointment` ADD CONSTRAINT `Appointment_dealId_fkey` FOREIGN KEY (`dealId`) REFERENCES `Deal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Appointment.Appointment_dealId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Appointment' AND CONSTRAINT_NAME = 'Appointment_contactPersonId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Appointment` ADD CONSTRAINT `Appointment_contactPersonId_fkey` FOREIGN KEY (`contactPersonId`) REFERENCES `ContactPerson`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Appointment.Appointment_contactPersonId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Appointment' AND CONSTRAINT_NAME = 'Appointment_completedInteractionId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Appointment` ADD CONSTRAINT `Appointment_completedInteractionId_fkey` FOREIGN KEY (`completedInteractionId`) REFERENCES `Interaction`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Appointment.Appointment_completedInteractionId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SalesSettings' AND CONSTRAINT_NAME = 'SalesSettings_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `SalesSettings` ADD CONSTRAINT `SalesSettings_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: SalesSettings.SalesSettings_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET FOREIGN_KEY_CHECKS=1;

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20261007100000_m2_follow_ups', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20261007100000_m2_follow_ups'
);

-- ---------------------------------------------------------------
--  28. Milestone 3 contracts permission (M3 Slice 2: FR-RBAC-19, FR-RBAC-20)
-- ---------------------------------------------------------------

SELECT 'm3 contracts permissions' AS step, DATABASE() AS db, NOW() AS at;

-- Give the system roles of every existing tenant the Milestone 3 contracts
-- permission (contracts.terminate) at its SRS M3 §7.2 default. Payment and
-- performance keys were seeded by Milestone 1. Customised grants are never
-- changed, copied roles are left to the Administrator, and the ledger row
-- makes it run once per tenant.
-- BEGIN GENERATED PERMISSION UPGRADE m3-contracts-payments
-- Generated by scripts/generate-role-seed-sql.ts from PERMISSION_UPGRADES and DEFAULT_ROLE_MATRIX.
-- One Role audit entry per system role still missing one of its new keys, from
-- the system actor (FR-RBAC-10). Runs before the grants, which it describes.
INSERT INTO `AuditEntry` (`id`, `tenantId`, `at`, `userId`, `userRole`, `action`, `entityType`, `entityId`, `entityLabel`, `changes`)
SELECT UUID(), r.tenantId, NOW(3), NULL, 'SYSTEM', 'UPDATE', 'Role', r.id,
  COALESCE(NULLIF(r.nameSq, ''), r.nameEn), CAST(v.changes AS JSON)
FROM `Role` r
JOIN (
  SELECT 'SALES_MANAGER' AS rolekey, '[{"field":"permissionsAdded","old":null,"new":["contracts.terminate"]},{"field":"permissionUpgrade","old":null,"new":"m3-contracts-payments"}]' AS changes
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, '[{"field":"permissionsAdded","old":null,"new":["contracts.terminate"]},{"field":"permissionUpgrade","old":null,"new":"m3-contracts-payments"}]' AS changes
) v ON v.rolekey = r.`key`
WHERE r.isSystem = 1
  AND NOT EXISTS (
    SELECT 1 FROM `AppliedPermissionUpgrade` a WHERE a.tenantId = r.tenantId AND a.`key` = 'm3-contracts-payments'
  )
  AND EXISTS (
    SELECT 1 FROM (
  SELECT 'SALES_MANAGER' AS rolekey, 'contracts.terminate' AS permissionkey, 'TEAM' AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'contracts.terminate' AS permissionkey, 'ALL' AS scope
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
  SELECT 'SALES_MANAGER' AS rolekey, 'contracts.terminate' AS permissionkey, 'TEAM' AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'contracts.terminate' AS permissionkey, 'ALL' AS scope
) v ON v.rolekey = r.`key`
WHERE r.isSystem = 1
  AND NOT EXISTS (
    SELECT 1 FROM `AppliedPermissionUpgrade` a WHERE a.tenantId = r.tenantId AND a.`key` = 'm3-contracts-payments'
  )
  AND NOT EXISTS (
    SELECT 1 FROM `RolePermission` rp WHERE rp.roleId = r.id AND rp.permissionKey = v.permissionkey
  );

-- Record the upgrade, so it never runs again for these tenants.
INSERT INTO `AppliedPermissionUpgrade` (`tenantId`, `key`, `appliedAt`)
SELECT t.id, 'm3-contracts-payments', NOW(3)
FROM `Tenant` t
WHERE NOT EXISTS (
    SELECT 1 FROM `AppliedPermissionUpgrade` a WHERE a.tenantId = t.id AND a.`key` = 'm3-contracts-payments'
  );
-- END GENERATED PERMISSION UPGRADE m3-contracts-payments

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20261008100000_m3_contracts_permissions', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20261008100000_m3_contracts_permissions'
);

-- ---------------------------------------------------------------
--  29. Contract settings (M3 Slice 3: FR-REN-01, FR-REN-04, FR-PAY-09, FR-CON-05)
-- ---------------------------------------------------------------

SELECT 'm3 contract settings' AS step, DATABASE() AS db, NOW() AS at;

CREATE TABLE IF NOT EXISTS `ContractSettings` (
    `tenantId` VARCHAR(191) NOT NULL,
    `reminderLeadDays` JSON NOT NULL DEFAULT (JSON_ARRAY(60, 30, 7)),
    `expiringSoonDays` INTEGER NOT NULL DEFAULT 30,
    `paymentGraceDays` INTEGER NOT NULL DEFAULT 0,
    `numberPrefix` VARCHAR(191) NOT NULL DEFAULT 'CTR',
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedByUserId` VARCHAR(191) NULL,

    PRIMARY KEY (`tenantId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ContractSettings' AND CONSTRAINT_NAME = 'ContractSettings_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `ContractSettings` ADD CONSTRAINT `ContractSettings_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: ContractSettings.ContractSettings_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20261009100000_m3_contract_settings', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20261009100000_m3_contract_settings'
);

-- M3 Slice 4: contracts from won deals (FR-CON-01..10, NFR-ACC-03, NFR-DAT-01)
-- Refuse to continue if a stored Float amount would move by half a cent or
-- more when rounded to two decimals (plan D2, NFR-OPS-03). Review the rows
-- this lists, then run `SET @m3_rounding_reviewed := 1;` in the same session
-- and run the script again. Amounts that already have two decimals do not
-- move. Skipped once the columns are DECIMAL.
SET @is_float := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND COLUMN_NAME = 'amount' AND DATA_TYPE <> 'decimal');
SET @sql := IF(@is_float = 0, 'SELECT ''skip: amounts are already DECIMAL'' AS note',
  'SELECT ''Contract'' AS tbl, `id`, ''amount'' AS col, `amount` AS value FROM `Contract` WHERE ABS(`amount` - ROUND(`amount`, 2)) >= 0.005 UNION ALL SELECT ''ContractPayment'', `id`, ''amount'', `amount` FROM `ContractPayment` WHERE ABS(`amount` - ROUND(`amount`, 2)) >= 0.005 UNION ALL SELECT ''ContractPayment'', `id`, ''paidAmount'', `paidAmount` FROM `ContractPayment` WHERE ABS(`paidAmount` - ROUND(`paidAmount`, 2)) >= 0.005');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @moved := IF(@is_float = 0, 0, (SELECT COUNT(*) FROM `Contract` WHERE ABS(`amount` - ROUND(`amount`, 2)) >= 0.005) + (SELECT COUNT(*) FROM `ContractPayment` WHERE ABS(`amount` - ROUND(`amount`, 2)) >= 0.005 OR ABS(`paidAmount` - ROUND(`paidAmount`, 2)) >= 0.005));
SET @sql := IF(@moved > 0 AND COALESCE(@m3_rounding_reviewed, 0) = 0, 'SELECT * FROM `m3_amounts_would_change_review_the_rows_listed_above`', 'SELECT ''rounding check passed'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND COLUMN_NAME = 'amount' AND DATA_TYPE = 'decimal');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` MODIFY `amount` DECIMAL(12, 2) NOT NULL', 'SELECT ''skip: Contract.amount is already DECIMAL'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ContractPayment' AND COLUMN_NAME = 'amount' AND DATA_TYPE = 'decimal');
SET @sql := IF(@needed = 0, 'ALTER TABLE `ContractPayment` MODIFY `amount` DECIMAL(12, 2) NOT NULL', 'SELECT ''skip: ContractPayment.amount is already DECIMAL'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ContractPayment' AND COLUMN_NAME = 'paidAmount' AND DATA_TYPE = 'decimal');
SET @sql := IF(@needed = 0, 'ALTER TABLE `ContractPayment` MODIFY `paidAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0', 'SELECT ''skip: ContractPayment.paidAmount is already DECIMAL'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ContractPayment' AND COLUMN_NAME = 'status' AND COLUMN_DEFAULT = 'NOT_INVOICED');
SET @sql := IF(@needed = 0, 'ALTER TABLE `ContractPayment` ALTER COLUMN `status` SET DEFAULT ''NOT_INVOICED''', 'SELECT ''skip: ContractPayment.status default'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND COLUMN_NAME = 'agreedAnnualValue');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD COLUMN `agreedAnnualValue` DECIMAL(12, 2) NULL', 'SELECT ''skip: Contract.agreedAnnualValue'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND COLUMN_NAME = 'cancelReason');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD COLUMN `cancelReason` TEXT NULL', 'SELECT ''skip: Contract.cancelReason'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND COLUMN_NAME = 'dealId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD COLUMN `dealId` VARCHAR(191) NULL', 'SELECT ''skip: Contract.dealId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND COLUMN_NAME = 'discountPercent');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD COLUMN `discountPercent` DECIMAL(7, 2) NULL', 'SELECT ''skip: Contract.discountPercent'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND COLUMN_NAME = 'lockedAt');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD COLUMN `lockedAt` DATETIME(3) NULL', 'SELECT ''skip: Contract.lockedAt'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND COLUMN_NAME = 'notRenewingNote');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD COLUMN `notRenewingNote` TEXT NULL', 'SELECT ''skip: Contract.notRenewingNote'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND COLUMN_NAME = 'notRenewingReasonId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD COLUMN `notRenewingReasonId` VARCHAR(191) NULL', 'SELECT ''skip: Contract.notRenewingReasonId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND COLUMN_NAME = 'number');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD COLUMN `number` VARCHAR(191) NULL', 'SELECT ''skip: Contract.number'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND COLUMN_NAME = 'packageId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD COLUMN `packageId` VARCHAR(191) NULL', 'SELECT ''skip: Contract.packageId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND COLUMN_NAME = 'quotationId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD COLUMN `quotationId` VARCHAR(191) NULL', 'SELECT ''skip: Contract.quotationId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND COLUMN_NAME = 'renewalDate');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD COLUMN `renewalDate` DATE NULL', 'SELECT ''skip: Contract.renewalDate'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND COLUMN_NAME = 'servicesSnapshot');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD COLUMN `servicesSnapshot` JSON NULL', 'SELECT ''skip: Contract.servicesSnapshot'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND COLUMN_NAME = 'suspendedAt');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD COLUMN `suspendedAt` DATETIME(3) NULL', 'SELECT ''skip: Contract.suspendedAt'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND COLUMN_NAME = 'suspensionReason');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD COLUMN `suspensionReason` TEXT NULL', 'SELECT ''skip: Contract.suspensionReason'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND COLUMN_NAME = 'termsText');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD COLUMN `termsText` JSON NULL', 'SELECT ''skip: Contract.termsText'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ContractPayment' AND COLUMN_NAME = 'invoiceDate');
SET @sql := IF(@needed = 0, 'ALTER TABLE `ContractPayment` ADD COLUMN `invoiceDate` DATE NULL', 'SELECT ''skip: ContractPayment.invoiceDate'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ContractPayment' AND COLUMN_NAME = 'invoiceNumber');
SET @sql := IF(@needed = 0, 'ALTER TABLE `ContractPayment` ADD COLUMN `invoiceNumber` VARCHAR(191) NULL', 'SELECT ''skip: ContractPayment.invoiceNumber'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ContractPayment' AND COLUMN_NAME = 'overdueNotifiedAt');
SET @sql := IF(@needed = 0, 'ALTER TABLE `ContractPayment` ADD COLUMN `overdueNotifiedAt` DATETIME(3) NULL', 'SELECT ''skip: ContractPayment.overdueNotifiedAt'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND INDEX_NAME = 'Contract_dealId_key');
SET @sql := IF(@needed = 0, 'CREATE UNIQUE INDEX `Contract_dealId_key` ON `Contract`(`dealId`)', 'SELECT ''skip: Contract_dealId_key'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND INDEX_NAME = 'Contract_quotationId_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Contract_quotationId_idx` ON `Contract`(`quotationId`)', 'SELECT ''skip: Contract_quotationId_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND INDEX_NAME = 'Contract_packageId_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Contract_packageId_idx` ON `Contract`(`packageId`)', 'SELECT ''skip: Contract_packageId_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND INDEX_NAME = 'Contract_notRenewingReasonId_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Contract_notRenewingReasonId_idx` ON `Contract`(`notRenewingReasonId`)', 'SELECT ''skip: Contract_notRenewingReasonId_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND INDEX_NAME = 'Contract_tenantId_number_key');
SET @sql := IF(@needed = 0, 'CREATE UNIQUE INDEX `Contract_tenantId_number_key` ON `Contract`(`tenantId`, `number`)', 'SELECT ''skip: Contract_tenantId_number_key'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND CONSTRAINT_NAME = 'Contract_dealId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD CONSTRAINT `Contract_dealId_fkey` FOREIGN KEY (`dealId`) REFERENCES `Deal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Contract_dealId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND CONSTRAINT_NAME = 'Contract_quotationId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD CONSTRAINT `Contract_quotationId_fkey` FOREIGN KEY (`quotationId`) REFERENCES `Quotation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Contract_quotationId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND CONSTRAINT_NAME = 'Contract_packageId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD CONSTRAINT `Contract_packageId_fkey` FOREIGN KEY (`packageId`) REFERENCES `ServicePackage`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Contract_packageId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND CONSTRAINT_NAME = 'Contract_notRenewingReasonId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD CONSTRAINT `Contract_notRenewingReasonId_fkey` FOREIGN KEY (`notRenewingReasonId`) REFERENCES `LostReason`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Contract_notRenewingReasonId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20261010100000_m3_contracts_from_deals', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20261010100000_m3_contracts_from_deals'
);

-- ---------------------------------------------------------------
-- 31. Signed contract document versions (M3 Slice 5: FR-CON-19)
-- ---------------------------------------------------------------

SELECT 'm3 contract documents' AS step, DATABASE() AS db, NOW() AS at;

CREATE TABLE IF NOT EXISTS `ContractDocument` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `contractId` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `uploadedByUserId` VARCHAR(191) NOT NULL,
    `uploadedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `isCurrent` BOOLEAN NOT NULL DEFAULT true,

    INDEX `ContractDocument_contractId_isCurrent_idx`(`contractId`, `isCurrent`),
    INDEX `ContractDocument_tenantId_contractId_idx`(`tenantId`, `contractId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ContractDocument.ContractDocument_contractId_fkey
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ContractDocument' AND CONSTRAINT_NAME = 'ContractDocument_contractId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `ContractDocument` ADD CONSTRAINT `ContractDocument_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `Contract`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: ContractDocument.ContractDocument_contractId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ContractDocument.ContractDocument_uploadedByUserId_fkey
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ContractDocument' AND CONSTRAINT_NAME = 'ContractDocument_uploadedByUserId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `ContractDocument` ADD CONSTRAINT `ContractDocument_uploadedByUserId_fkey` FOREIGN KEY (`uploadedByUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: ContractDocument.ContractDocument_uploadedByUserId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Copy each existing document into one current row (once).
INSERT INTO `ContractDocument` (`id`, `tenantId`, `contractId`, `fileName`, `url`, `uploadedByUserId`, `uploadedAt`, `isCurrent`)
SELECT UUID(), c.`tenantId`, c.`id`, COALESCE(c.`documentName`, 'contract.pdf'), c.`documentUrl`, c.`createdByUserId`, c.`updatedAt`, true
FROM `Contract` c
WHERE c.`documentUrl` IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `ContractDocument` d WHERE d.`contractId` = c.`id`);

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20261011100000_m3_contract_documents', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20261011100000_m3_contract_documents'
);

-- ---------------------------------------------------------------
-- 32. Instalment history (M3 Slice 8: FR-PAY-08)
-- ---------------------------------------------------------------

SELECT 'm3 contract payment history' AS step, DATABASE() AS db, NOW() AS at;

CREATE TABLE IF NOT EXISTS `ContractPaymentHistory` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `paymentId` VARCHAR(191) NOT NULL,
    `fromStatus` VARCHAR(191) NOT NULL,
    `toStatus` VARCHAR(191) NOT NULL,
    `amountReceived` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `receivedOn` DATE NULL,
    `method` VARCHAR(191) NULL,
    `changedByUserId` VARCHAR(191) NULL,
    `comment` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ContractPaymentHistory_paymentId_createdAt_idx`(`paymentId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ContractPaymentHistory.ContractPaymentHistory_paymentId_fkey
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ContractPaymentHistory' AND CONSTRAINT_NAME = 'ContractPaymentHistory_paymentId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `ContractPaymentHistory` ADD CONSTRAINT `ContractPaymentHistory_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `ContractPayment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: ContractPaymentHistory.ContractPaymentHistory_paymentId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ContractPaymentHistory.ContractPaymentHistory_changedByUserId_fkey
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ContractPaymentHistory' AND CONSTRAINT_NAME = 'ContractPaymentHistory_changedByUserId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `ContractPaymentHistory` ADD CONSTRAINT `ContractPaymentHistory_changedByUserId_fkey` FOREIGN KEY (`changedByUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: ContractPaymentHistory.ContractPaymentHistory_changedByUserId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20261012100000_m3_contract_payment_history', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20261012100000_m3_contract_payment_history'
);

-- M3 Slice 9: ContractPayment (tenantId, paidAt)
SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ContractPayment' AND INDEX_NAME = 'ContractPayment_tenantId_paidAt_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `ContractPayment_tenantId_paidAt_idx` ON `ContractPayment`(`tenantId`, `paidAt`)', 'SELECT ''skip: ContractPayment_tenantId_paidAt_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20261013100000_m3_payment_paid_at_index', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20261013100000_m3_payment_paid_at_index'
);

-- M3 Slice 10: Deal.renewalOfContractId
SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Deal' AND COLUMN_NAME = 'renewalOfContractId');
SET @sql := IF(@needed, 'ALTER TABLE `Deal` ADD COLUMN `renewalOfContractId` VARCHAR(191) NULL', 'SELECT ''skip: Deal.renewalOfContractId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Deal' AND INDEX_NAME = 'Deal_renewalOfContractId_idx');
SET @sql := IF(@needed, 'CREATE INDEX `Deal_renewalOfContractId_idx` ON `Deal`(`renewalOfContractId`)', 'SELECT ''skip: Deal_renewalOfContractId_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Deal' AND CONSTRAINT_NAME = 'Deal_renewalOfContractId_fkey');
SET @sql := IF(@needed, 'ALTER TABLE `Deal` ADD CONSTRAINT `Deal_renewalOfContractId_fkey` FOREIGN KEY (`renewalOfContractId`) REFERENCES `Contract`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Deal_renewalOfContractId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20261014100000_m3_renewal_deal', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20261014100000_m3_renewal_deal'
);

-- M3 Slice 11: ContractReminder replaces Contract.expiryNotifiedAt (FR-REN-01, FR-REN-03)
CREATE TABLE IF NOT EXISTS `ContractReminder` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `contractId` VARCHAR(191) NOT NULL,
    `leadDays` INTEGER NOT NULL,
    `state` VARCHAR(191) NOT NULL,
    `sentAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ContractReminder_contractId_leadDays_key`(`contractId`, `leadDays`),
    INDEX `ContractReminder_tenantId_contractId_idx`(`tenantId`, `contractId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ContractReminder' AND CONSTRAINT_NAME = 'ContractReminder_contractId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed, 'ALTER TABLE `ContractReminder` ADD CONSTRAINT `ContractReminder_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `Contract`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: ContractReminder_contractId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_old := (SELECT COUNT(*) > 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND COLUMN_NAME = 'expiryNotifiedAt');

SET @sql := IF(@has_old,
  'INSERT IGNORE INTO `ContractReminder` (`id`, `tenantId`, `contractId`, `leadDays`, `state`, `sentAt`) SELECT UUID(), `tenantId`, `id`, 30, ''SENT'', `expiryNotifiedAt` FROM `Contract` WHERE `expiryNotifiedAt` IS NOT NULL',
  'SELECT ''skip: copy of Contract.expiryNotifiedAt'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(@has_old, 'ALTER TABLE `Contract` DROP COLUMN `expiryNotifiedAt`', 'SELECT ''skip: Contract.expiryNotifiedAt already dropped'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20261015100000_m3_contract_reminders', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20261015100000_m3_contract_reminders'
);

-- M3 Slice 12: DealStageHistory.ownerUserId, Appointment.completedAt and the period indexes (FR-PRF-05, D13)
SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DealStageHistory' AND COLUMN_NAME = 'ownerUserId');
SET @sql := IF(@needed, 'ALTER TABLE `DealStageHistory` ADD COLUMN `ownerUserId` VARCHAR(191) NULL', 'SELECT ''skip: DealStageHistory.ownerUserId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Appointment' AND COLUMN_NAME = 'completedAt');
SET @sql := IF(@needed, 'ALTER TABLE `Appointment` ADD COLUMN `completedAt` DATETIME(3) NULL', 'SELECT ''skip: Appointment.completedAt'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill: only rows still NULL, so a second run changes nothing.
UPDATE `DealStageHistory` h JOIN `Deal` d ON d.`id` = h.`dealId` SET h.`ownerUserId` = d.`ownerUserId` WHERE h.`ownerUserId` IS NULL;
UPDATE `Appointment` SET `completedAt` = `updatedAt` WHERE `kind` = 'FOLLOW_UP' AND `status` = 'COMPLETED' AND `completedAt` IS NULL;

SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DealStageHistory' AND INDEX_NAME = 'DealStageHistory_tenantId_ownerUserId_toStage_at_idx');
SET @sql := IF(@needed, 'CREATE INDEX `DealStageHistory_tenantId_ownerUserId_toStage_at_idx` ON `DealStageHistory`(`tenantId`, `ownerUserId`, `toStage`, `at`)', 'SELECT ''skip: DealStageHistory_tenantId_ownerUserId_toStage_at_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Deal' AND INDEX_NAME = 'Deal_tenantId_wonAt_idx');
SET @sql := IF(@needed, 'CREATE INDEX `Deal_tenantId_wonAt_idx` ON `Deal`(`tenantId`, `wonAt`)', 'SELECT ''skip: Deal_tenantId_wonAt_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Deal' AND INDEX_NAME = 'Deal_tenantId_lostAt_idx');
SET @sql := IF(@needed, 'CREATE INDEX `Deal_tenantId_lostAt_idx` ON `Deal`(`tenantId`, `lostAt`)', 'SELECT ''skip: Deal_tenantId_lostAt_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Interaction' AND INDEX_NAME = 'Interaction_tenantId_authorUserId_occurredAt_idx');
SET @sql := IF(@needed, 'CREATE INDEX `Interaction_tenantId_authorUserId_occurredAt_idx` ON `Interaction`(`tenantId`, `authorUserId`, `occurredAt`)', 'SELECT ''skip: Interaction_tenantId_authorUserId_occurredAt_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND INDEX_NAME = 'Quotation_tenantId_sentAt_idx');
SET @sql := IF(@needed, 'CREATE INDEX `Quotation_tenantId_sentAt_idx` ON `Quotation`(`tenantId`, `sentAt`)', 'SELECT ''skip: Quotation_tenantId_sentAt_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Quotation' AND INDEX_NAME = 'Quotation_tenantId_createdByUserId_createdAt_idx');
SET @sql := IF(@needed, 'CREATE INDEX `Quotation_tenantId_createdByUserId_createdAt_idx` ON `Quotation`(`tenantId`, `createdByUserId`, `createdAt`)', 'SELECT ''skip: Quotation_tenantId_createdByUserId_createdAt_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) = 0 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Appointment' AND INDEX_NAME = 'Appointment_tenantId_completedAt_idx');
SET @sql := IF(@needed, 'CREATE INDEX `Appointment_tenantId_completedAt_idx` ON `Appointment`(`tenantId`, `completedAt`)', 'SELECT ''skip: Appointment_tenantId_completedAt_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20261016100000_m3_performance_indexes', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20261016100000_m3_performance_indexes'
);

-- ---------------------------------------------------------------
--  33. Wellness+ permissions (M4 Slice 2: FR-RBAC-25, FR-RBAC-26)
-- ---------------------------------------------------------------

SELECT 'm4 wellness permissions' AS step, DATABASE() AS db, NOW() AS at;

-- Give the system roles of every existing tenant the nine Wellness+
-- permissions at their SRS M4 §10.2 defaults. Customised grants are never
-- changed, copied roles are left to the Administrator, and the ledger row
-- makes it run once per tenant.
-- BEGIN GENERATED PERMISSION UPGRADE m4-wellness-plus
-- Generated by scripts/generate-role-seed-sql.ts from PERMISSION_UPGRADES and DEFAULT_ROLE_MATRIX.
-- One Role audit entry per system role still missing one of its new keys, from
-- the system actor (FR-RBAC-10). Runs before the grants, which it describes.
INSERT INTO `AuditEntry` (`id`, `tenantId`, `at`, `userId`, `userRole`, `action`, `entityType`, `entityId`, `entityLabel`, `changes`)
SELECT UUID(), r.tenantId, NOW(3), NULL, 'SYSTEM', 'UPDATE', 'Role', r.id,
  COALESCE(NULLIF(r.nameSq, ''), r.nameEn), CAST(v.changes AS JSON)
FROM `Role` r
JOIN (
  SELECT 'RECEPTION' AS rolekey, '[{"field":"permissionsAdded","old":null,"new":["members.verify"]},{"field":"permissionUpgrade","old":null,"new":"m4-wellness-plus"}]' AS changes
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, '[{"field":"permissionsAdded","old":null,"new":["members.import","members.manage","members.payments.record","members.payments.view","members.reports.view","members.verify","members.view","members.vip.approve","wellnessplus.settings.manage"]},{"field":"permissionUpgrade","old":null,"new":"m4-wellness-plus"}]' AS changes
  UNION ALL
  SELECT 'CEO' AS rolekey, '[{"field":"permissionsAdded","old":null,"new":["members.payments.view","members.reports.view","members.view"]},{"field":"permissionUpgrade","old":null,"new":"m4-wellness-plus"}]' AS changes
) v ON v.rolekey = r.`key`
WHERE r.isSystem = 1
  AND NOT EXISTS (
    SELECT 1 FROM `AppliedPermissionUpgrade` a WHERE a.tenantId = r.tenantId AND a.`key` = 'm4-wellness-plus'
  )
  AND EXISTS (
    SELECT 1 FROM (
  SELECT 'RECEPTION' AS rolekey, 'members.verify' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'members.import' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'members.manage' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'members.payments.record' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'members.payments.view' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'members.reports.view' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'members.verify' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'members.view' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'members.vip.approve' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'wellnessplus.settings.manage' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'CEO' AS rolekey, 'members.payments.view' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'CEO' AS rolekey, 'members.reports.view' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'CEO' AS rolekey, 'members.view' AS permissionkey, NULL AS scope
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
  SELECT 'RECEPTION' AS rolekey, 'members.verify' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'members.import' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'members.manage' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'members.payments.record' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'members.payments.view' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'members.reports.view' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'members.verify' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'members.view' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'members.vip.approve' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'ADMINISTRATOR' AS rolekey, 'wellnessplus.settings.manage' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'CEO' AS rolekey, 'members.payments.view' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'CEO' AS rolekey, 'members.reports.view' AS permissionkey, NULL AS scope
  UNION ALL
  SELECT 'CEO' AS rolekey, 'members.view' AS permissionkey, NULL AS scope
) v ON v.rolekey = r.`key`
WHERE r.isSystem = 1
  AND NOT EXISTS (
    SELECT 1 FROM `AppliedPermissionUpgrade` a WHERE a.tenantId = r.tenantId AND a.`key` = 'm4-wellness-plus'
  )
  AND NOT EXISTS (
    SELECT 1 FROM `RolePermission` rp WHERE rp.roleId = r.id AND rp.permissionKey = v.permissionkey
  );

-- Record the upgrade, so it never runs again for these tenants.
INSERT INTO `AppliedPermissionUpgrade` (`tenantId`, `key`, `appliedAt`)
SELECT t.id, 'm4-wellness-plus', NOW(3)
FROM `Tenant` t
WHERE NOT EXISTS (
    SELECT 1 FROM `AppliedPermissionUpgrade` a WHERE a.tenantId = t.id AND a.`key` = 'm4-wellness-plus'
  );
-- END GENERATED PERMISSION UPGRADE m4-wellness-plus

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20261017100000_m4_wellness_permissions', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20261017100000_m4_wellness_permissions'
);

-- ---------------------------------------------------------------
--  34. Wellness+ settings and benefit table (M4 Slice 3: FR-TIR-01, FR-BEN-01, FR-BEN-02, FR-FAM-02, NFR-OPS-04)
-- ---------------------------------------------------------------

SELECT 'm4 wellness settings' AS step, DATABASE() AS db, NOW() AS at;

CREATE TABLE IF NOT EXISTS `TierSetting` (
    `tenantId` VARCHAR(191) NOT NULL,
    `tier` VARCHAR(191) NOT NULL,
    `labelSq` VARCHAR(191) NOT NULL,
    `labelEn` VARCHAR(191) NOT NULL,
    `colour` VARCHAR(191) NOT NULL,
    `fee` DECIMAL(12, 2) NULL,
    `termMonths` INTEGER NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedByUserId` VARCHAR(191) NULL,

    PRIMARY KEY (`tenantId`, `tier`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `MembershipSettings` (
    `tenantId` VARCHAR(191) NOT NULL,
    `familyDiscountPercent` DECIMAL(7, 2) NOT NULL DEFAULT 50,
    `graceDays` INTEGER NOT NULL DEFAULT 0,
    `expiringSoonDays` INTEGER NOT NULL DEFAULT 30,
    `memberPrefix` VARCHAR(191) NOT NULL DEFAULT 'WP',
    `receiptPrefix` VARCHAR(191) NOT NULL DEFAULT 'RCP',
    `vipReviewNoticeDays` INTEGER NOT NULL DEFAULT 30,
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedByUserId` VARCHAR(191) NULL,

    PRIMARY KEY (`tenantId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `FamilyRelationship` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `nameSq` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(191) NOT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,

    INDEX `FamilyRelationship_tenantId_order_idx`(`tenantId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `BenefitService` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `nameSq` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(191) NOT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,

    INDEX `BenefitService_tenantId_order_idx`(`tenantId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `BenefitDiscount` (
    `serviceId` VARCHAR(191) NOT NULL,
    `tier` VARCHAR(191) NOT NULL,
    `percent` DECIMAL(5, 2) NOT NULL,

    PRIMARY KEY (`serviceId`, `tier`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TierSetting' AND CONSTRAINT_NAME = 'TierSetting_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `TierSetting` ADD CONSTRAINT `TierSetting_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: TierSetting.TierSetting_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'MembershipSettings' AND CONSTRAINT_NAME = 'MembershipSettings_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `MembershipSettings` ADD CONSTRAINT `MembershipSettings_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: MembershipSettings.MembershipSettings_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'FamilyRelationship' AND CONSTRAINT_NAME = 'FamilyRelationship_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `FamilyRelationship` ADD CONSTRAINT `FamilyRelationship_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: FamilyRelationship.FamilyRelationship_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'BenefitService' AND CONSTRAINT_NAME = 'BenefitService_tenantId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `BenefitService` ADD CONSTRAINT `BenefitService_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: BenefitService.BenefitService_tenantId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'BenefitDiscount' AND CONSTRAINT_NAME = 'BenefitDiscount_serviceId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `BenefitDiscount` ADD CONSTRAINT `BenefitDiscount_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `BenefitService`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT ''skip: BenefitDiscount.BenefitDiscount_serviceId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Seed: the defaults in src/membership/domain/DefaultMembership.ts for every
-- workspace that has none yet (NFR-OPS-04). A workspace that has any row of a
-- kind is left alone.
-- BEGIN GENERATED MEMBERSHIP SEED
INSERT INTO `TierSetting` (`tenantId`, `tier`, `labelSq`, `labelEn`, `colour`, `fee`, `termMonths`, `updatedAt`)
SELECT t.id, v.tier, v.labelsq, v.labelen, v.colour, v.fee, v.termmonths, NOW(3)
FROM `Tenant` t
CROSS JOIN (
  SELECT 'BRONZE' AS tier, 'Bronz' AS labelsq, 'Bronze' AS labelen, '#B26A2B' AS colour, NULL AS fee, NULL AS termmonths
  UNION ALL
  SELECT 'SILVER', 'Argjend', 'Silver', '#8A939B', 60.00, 12
  UNION ALL
  SELECT 'GOLD', 'Ar', 'Gold', '#C9A227', 100.00, 12
  UNION ALL
  SELECT 'VIP', 'VIP', 'VIP', '#5B3FA6', NULL, 12
) v
WHERE NOT EXISTS (SELECT 1 FROM `TierSetting` x WHERE x.tenantId = t.id);

INSERT INTO `MembershipSettings` (`tenantId`, `familyDiscountPercent`, `graceDays`, `expiringSoonDays`, `memberPrefix`, `receiptPrefix`, `vipReviewNoticeDays`, `updatedAt`)
SELECT t.id, 50.00, 0, 30, 'WP', 'RCP', 30, NOW(3)
FROM `Tenant` t
WHERE NOT EXISTS (SELECT 1 FROM `MembershipSettings` x WHERE x.tenantId = t.id);

INSERT INTO `FamilyRelationship` (`id`, `tenantId`, `nameSq`, `nameEn`, `order`)
SELECT UUID(), t.id, v.namesq, v.nameen, v.ord
FROM `Tenant` t
CROSS JOIN (
  SELECT 'Bashkëshort ose partner' AS namesq, 'Spouse or partner' AS nameen, 1 AS ord
  UNION ALL
  SELECT 'Fëmijë', 'Child', 2
  UNION ALL
  SELECT 'Prind', 'Parent', 3
) v
WHERE NOT EXISTS (SELECT 1 FROM `FamilyRelationship` x WHERE x.tenantId = t.id);

INSERT INTO `BenefitService` (`id`, `tenantId`, `nameSq`, `nameEn`, `order`)
SELECT UUID(), t.id, v.namesq, v.nameen, v.ord
FROM `Tenant` t
CROSS JOIN (
  SELECT 'Kontroll parandalues' AS namesq, 'Preventive check-up' AS nameen, 1 AS ord
  UNION ALL
  SELECT 'Qasje te internisti', 'Internist access', 2
  UNION ALL
  SELECT 'Masazh relaksues ose sportiv (ose 1 seancë fizioterapie për një gjendje ekzistuese)', 'Relaxing or sports massage (or 1 physiotherapy session for an existing condition)', 3
  UNION ALL
  SELECT 'Ekzaminime radiologjike', 'Radiology examinations', 4
  UNION ALL
  SELECT 'Vizita te gjinekologu', 'Gynecologist visits', 5
  UNION ALL
  SELECT 'Vizita te kardiologu', 'Cardiologist visits', 6
  UNION ALL
  SELECT 'Vizita te reumatologu', 'Rheumatologist visits', 7
  UNION ALL
  SELECT 'Vizita te dermatologu', 'Dermatologist visits', 8
  UNION ALL
  SELECT 'Vizita te endokrinologu', 'Endocrinologist visits', 9
  UNION ALL
  SELECT 'Vizita te pediatri', 'Pediatrician visits', 10
  UNION ALL
  SELECT 'Shërbime infermierore në shtëpi', 'Home nursing services', 11
  UNION ALL
  SELECT 'Seanca fizioterapie dhe rehabilitimi fizik', 'Physiotherapy and physical rehabilitation sessions', 12
  UNION ALL
  SELECT 'Analiza laboratorike', 'Laboratory tests', 13
  UNION ALL
  SELECT 'Skaner CT (të gjitha llojet)', 'CT scan (all types)', 14
) v
WHERE NOT EXISTS (SELECT 1 FROM `BenefitService` x WHERE x.tenantId = t.id);

-- Only a workspace with no discount at all gets the seeded ones, so a re-run never
-- puts back a discount the Administrator cleared.
INSERT INTO `BenefitDiscount` (`serviceId`, `tier`, `percent`)
SELECT s.id, v.tier, v.percent
FROM (
  SELECT 'Preventive check-up' AS nameen, 'BRONZE' AS tier, 25.00 AS percent
  UNION ALL
  SELECT 'Preventive check-up', 'SILVER', 50.00
  UNION ALL
  SELECT 'Preventive check-up', 'GOLD', 100.00
  UNION ALL
  SELECT 'Preventive check-up', 'VIP', 100.00
  UNION ALL
  SELECT 'Internist access', 'BRONZE', 100.00
  UNION ALL
  SELECT 'Internist access', 'SILVER', 100.00
  UNION ALL
  SELECT 'Internist access', 'GOLD', 100.00
  UNION ALL
  SELECT 'Internist access', 'VIP', 100.00
  UNION ALL
  SELECT 'Relaxing or sports massage (or 1 physiotherapy session for an existing condition)', 'GOLD', 100.00
  UNION ALL
  SELECT 'Relaxing or sports massage (or 1 physiotherapy session for an existing condition)', 'VIP', 100.00
  UNION ALL
  SELECT 'Radiology examinations', 'GOLD', 50.00
  UNION ALL
  SELECT 'Radiology examinations', 'VIP', 50.00
  UNION ALL
  SELECT 'Gynecologist visits', 'BRONZE', 10.00
  UNION ALL
  SELECT 'Gynecologist visits', 'SILVER', 20.00
  UNION ALL
  SELECT 'Gynecologist visits', 'GOLD', 30.00
  UNION ALL
  SELECT 'Gynecologist visits', 'VIP', 30.00
  UNION ALL
  SELECT 'Cardiologist visits', 'BRONZE', 10.00
  UNION ALL
  SELECT 'Cardiologist visits', 'SILVER', 20.00
  UNION ALL
  SELECT 'Cardiologist visits', 'GOLD', 30.00
  UNION ALL
  SELECT 'Cardiologist visits', 'VIP', 30.00
  UNION ALL
  SELECT 'Rheumatologist visits', 'BRONZE', 10.00
  UNION ALL
  SELECT 'Rheumatologist visits', 'SILVER', 20.00
  UNION ALL
  SELECT 'Rheumatologist visits', 'GOLD', 30.00
  UNION ALL
  SELECT 'Rheumatologist visits', 'VIP', 30.00
  UNION ALL
  SELECT 'Dermatologist visits', 'BRONZE', 10.00
  UNION ALL
  SELECT 'Dermatologist visits', 'SILVER', 15.00
  UNION ALL
  SELECT 'Dermatologist visits', 'GOLD', 30.00
  UNION ALL
  SELECT 'Dermatologist visits', 'VIP', 30.00
  UNION ALL
  SELECT 'Endocrinologist visits', 'BRONZE', 10.00
  UNION ALL
  SELECT 'Endocrinologist visits', 'SILVER', 20.00
  UNION ALL
  SELECT 'Endocrinologist visits', 'GOLD', 30.00
  UNION ALL
  SELECT 'Endocrinologist visits', 'VIP', 30.00
  UNION ALL
  SELECT 'Pediatrician visits', 'BRONZE', 10.00
  UNION ALL
  SELECT 'Pediatrician visits', 'SILVER', 20.00
  UNION ALL
  SELECT 'Pediatrician visits', 'GOLD', 30.00
  UNION ALL
  SELECT 'Pediatrician visits', 'VIP', 30.00
  UNION ALL
  SELECT 'Home nursing services', 'BRONZE', 10.00
  UNION ALL
  SELECT 'Home nursing services', 'GOLD', 30.00
  UNION ALL
  SELECT 'Home nursing services', 'VIP', 30.00
  UNION ALL
  SELECT 'Physiotherapy and physical rehabilitation sessions', 'BRONZE', 10.00
  UNION ALL
  SELECT 'Physiotherapy and physical rehabilitation sessions', 'SILVER', 20.00
  UNION ALL
  SELECT 'Physiotherapy and physical rehabilitation sessions', 'GOLD', 30.00
  UNION ALL
  SELECT 'Physiotherapy and physical rehabilitation sessions', 'VIP', 30.00
  UNION ALL
  SELECT 'Laboratory tests', 'SILVER', 15.00
) v
JOIN `BenefitService` s ON s.nameEn = v.nameen
WHERE NOT EXISTS (
  SELECT 1 FROM `BenefitDiscount` d JOIN `BenefitService` s2 ON s2.id = d.serviceId WHERE s2.tenantId = s.tenantId
);
-- END GENERATED MEMBERSHIP SEED

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20261018100000_m4_wellness_settings', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20261018100000_m4_wellness_settings'
);

-- ---------------------------------------------------------------
-- M4 Slice 4: member record
-- ---------------------------------------------------------------
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

-- ---------------------------------------------------------------
-- M4 Slice 5: membership payments
-- ---------------------------------------------------------------
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
  UNION ALL SELECT 'PricingSettings table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='PricingSettings'
  UNION ALL SELECT 'EmployeeBand table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='EmployeeBand'
  UNION ALL SELECT 'RiskSurcharge table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='RiskSurcharge'
  UNION ALL SELECT 'VisitFrequency table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='VisitFrequency'
  UNION ALL SELECT 'PriceZone table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='PriceZone'
  UNION ALL SELECT 'PriceZoneCity table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='PriceZoneCity'
  UNION ALL SELECT 'PricingSettings.offerValidityDays', COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='PricingSettings' AND COLUMN_NAME='offerValidityDays'
  UNION ALL SELECT 'PricingSettings.closingEn', COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='PricingSettings' AND COLUMN_NAME='closingEn'
  UNION ALL SELECT 'Service table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Service'
  UNION ALL SELECT 'ServicePackage table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ServicePackage'
  UNION ALL SELECT 'PackageService table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='PackageService'
  UNION ALL SELECT 'SalesScript table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='SalesScript'
  UNION ALL SELECT 'Deal table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Deal'
  UNION ALL SELECT 'DealStageHistory table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='DealStageHistory'
  UNION ALL SELECT 'ActivityResult table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ActivityResult'
  UNION ALL SELECT 'Interaction.occurredAt', COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Interaction' AND COLUMN_NAME='occurredAt'
  UNION ALL SELECT 'Interaction.resultId', COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Interaction' AND COLUMN_NAME='resultId'
  UNION ALL SELECT 'Interaction.updatedByUserId', COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Interaction' AND COLUMN_NAME='updatedByUserId'
  UNION ALL SELECT 'Quotation.dealId', COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Quotation' AND COLUMN_NAME='dealId'
  UNION ALL SELECT 'Quotation.netMonthlyPrice', COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Quotation' AND COLUMN_NAME='netMonthlyPrice'
  UNION ALL SELECT 'Quotation.ruleSnapshot', COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Quotation' AND COLUMN_NAME='ruleSnapshot'
  UNION ALL SELECT 'QuotationService table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='QuotationService'
  UNION ALL SELECT 'Deal.offerNetMonthlyPrice', COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Deal' AND COLUMN_NAME='offerNetMonthlyPrice'
  UNION ALL SELECT 'Quotation.number', COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Quotation' AND COLUMN_NAME='number'
  UNION ALL SELECT 'Quotation.renderSnapshot', COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Quotation' AND COLUMN_NAME='renderSnapshot'
  UNION ALL SELECT 'Quotation.validUntil', COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Quotation' AND COLUMN_NAME='validUntil'
  UNION ALL SELECT 'DocumentSequence table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='DocumentSequence'
  UNION ALL SELECT 'DiscountApproval table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='DiscountApproval'
  UNION ALL SELECT 'NotificationSettings.discountApprovalReminderHours', COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='NotificationSettings' AND COLUMN_NAME='discountApprovalReminderHours'
  UNION ALL SELECT 'DiscountApproval.kind', COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='DiscountApproval' AND COLUMN_NAME='kind'
  UNION ALL SELECT 'DiscountApproval.requestedMonthlyPrice', COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='DiscountApproval' AND COLUMN_NAME='requestedMonthlyPrice'
  UNION ALL SELECT 'DiscountApproval.approvedMonthlyPrice', COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='DiscountApproval' AND COLUMN_NAME='approvedMonthlyPrice'
  UNION ALL SELECT 'Quotation.manualMonthlyPrice', COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Quotation' AND COLUMN_NAME='manualMonthlyPrice'
  UNION ALL SELECT 'Quotation.manualPriceReason', COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Quotation' AND COLUMN_NAME='manualPriceReason'
  UNION ALL SELECT 'Appointment.kind', COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Appointment' AND COLUMN_NAME='kind'
  UNION ALL SELECT 'Appointment.completedInteractionId', COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Appointment' AND COLUMN_NAME='completedInteractionId'
  UNION ALL SELECT 'Appointment.dueNotifiedAt', COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Appointment' AND COLUMN_NAME='dueNotifiedAt'
  UNION ALL SELECT 'NotificationSettings.followUpDailySummaryEnabled', COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='NotificationSettings' AND COLUMN_NAME='followUpDailySummaryEnabled'
  UNION ALL SELECT 'SalesSettings table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='SalesSettings'
  UNION ALL SELECT 'ContractSettings table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ContractSettings'
  UNION ALL SELECT 'BenefitService table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='BenefitService'
  UNION ALL SELECT 'MemberStatusHistory table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='MemberStatusHistory'
  UNION ALL SELECT 'MemberPayment table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='MemberPayment'
  UNION ALL SELECT 'ContractDocument table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ContractDocument'
  UNION ALL SELECT 'ContractPayment_tenantId_paidAt_idx', COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ContractPayment' AND INDEX_NAME='ContractPayment_tenantId_paidAt_idx'
  UNION ALL SELECT 'Deal.renewalOfContractId', COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Deal' AND COLUMN_NAME='renewalOfContractId'
  UNION ALL SELECT 'ContractReminder table', COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ContractReminder'
  UNION ALL SELECT 'DealStageHistory.ownerUserId', COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='DealStageHistory' AND COLUMN_NAME='ownerUserId'
  UNION ALL SELECT 'Appointment.completedAt', COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Appointment' AND COLUMN_NAME='completedAt'
) AS checks;

SELECT 'upgrade complete' AS step, NOW() AS at;
