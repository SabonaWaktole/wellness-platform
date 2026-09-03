-- MySQL equivalent of
-- prisma/migrations/20260902120000_add_form_versions_and_submissions
--
-- Run this by hand against the Hostinger production database — that database
-- is provisioned from nevacrm_full_import.sql, not Prisma's migration
-- history, so `prisma migrate deploy` will not pick this up.
--
-- Safe / additive: four new columns on an existing table and two new tables.
-- No existing row is read, rewritten or dropped.

ALTER TABLE `ClientForm`
  ADD COLUMN `shareToken`         VARCHAR(191) NULL,
  ADD COLUMN `isTemplate`         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `publishedVersionId` VARCHAR(191) NULL,
  -- NOT NULL with no DEFAULT, matching `layout` above it: MySQL refuses a
  -- literal default on JSON before 8.0.13. Added as nullable first, backfilled,
  -- then tightened, so the statement is safe on a table that already has rows.
  ADD COLUMN `settings`           JSON NULL;

UPDATE `ClientForm` SET `settings` = JSON_OBJECT() WHERE `settings` IS NULL;

ALTER TABLE `ClientForm`
  MODIFY COLUMN `settings` JSON NOT NULL;

CREATE UNIQUE INDEX `ClientForm_shareToken_key` ON `ClientForm`(`shareToken`);

CREATE TABLE `FormVersion` (
  `id`                VARCHAR(191) NOT NULL,
  `tenantId`          VARCHAR(191) NOT NULL,
  `formId`            VARCHAR(191) NOT NULL,
  `versionNumber`     INT NOT NULL,
  `document`          JSON NOT NULL,
  `publishedAt`       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `publishedByUserId` VARCHAR(191) NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `FormVersion_formId_versionNumber_key` ON `FormVersion`(`formId`, `versionNumber`);
CREATE INDEX `FormVersion_tenantId_formId_idx` ON `FormVersion`(`tenantId`, `formId`);

CREATE TABLE `FormSubmission` (
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

CREATE INDEX `FormSubmission_tenantId_formId_submittedAt_idx` ON `FormSubmission`(`tenantId`, `formId`, `submittedAt`);
CREATE INDEX `FormSubmission_tenantId_submittedAt_idx` ON `FormSubmission`(`tenantId`, `submittedAt`);

-- RESTRICT everywhere, matching ClientForm_tenantId_fkey: a published version
-- must outlive edits to the form it came from, because a FormSubmission is
-- pinned to it and would otherwise become unrenderable.
ALTER TABLE `FormVersion`
  ADD CONSTRAINT `FormVersion_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `FormVersion_formId_fkey` FOREIGN KEY (`formId`) REFERENCES `ClientForm`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `FormSubmission`
  ADD CONSTRAINT `FormSubmission_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `FormSubmission_formId_fkey` FOREIGN KEY (`formId`) REFERENCES `ClientForm`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `FormSubmission_formVersionId_fkey` FOREIGN KEY (`formVersionId`) REFERENCES `FormVersion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
