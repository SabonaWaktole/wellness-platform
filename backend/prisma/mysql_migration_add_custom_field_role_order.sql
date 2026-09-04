-- MySQL equivalent of prisma/migrations/20260825030142_add_custom_field_role_order_and_relax_client_columns
-- Run this by hand against the Hostinger production database — that
-- database is provisioned from nevacrm_full_import.sql, not Prisma's
-- migration history, so `prisma migrate deploy` will not pick this up.
--
-- Safe / additive: no data is dropped or rewritten. Existing rows keep
-- their current name/status values; the columns just stop being required
-- going forward.

ALTER TABLE `Client`
  MODIFY COLUMN `name` VARCHAR(191) NULL,
  MODIFY COLUMN `status` VARCHAR(191) NULL;

ALTER TABLE `CustomFieldDefinition`
  ADD COLUMN `order` INT NOT NULL DEFAULT 0,
  ADD COLUMN `required` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `role` VARCHAR(191) NULL;

-- MySQL treats multiple NULLs as distinct in a unique index (same as
-- Postgres), so existing rows — all NULL role today — are unaffected.
CREATE UNIQUE INDEX `CustomFieldDefinition_tenantId_role_key`
  ON `CustomFieldDefinition`(`tenantId`, `role`);
