-- MySQL equivalent of prisma/migrations/20260830120000_add_client_forms
-- Run this by hand against the Hostinger production database — that
-- database is provisioned from nevacrm_full_import.sql, not Prisma's
-- migration history, so `prisma migrate deploy` will not pick this up.
--
-- Safe / additive: one new table and one new nullable column. No existing
-- row is read, rewritten or dropped.

ALTER TABLE `Tenant`
  ADD COLUMN `clientFormSeededAt` DATETIME(3) NULL;

CREATE TABLE `ClientForm` (
  `id`          VARCHAR(191) NOT NULL,
  `tenantId`    VARCHAR(191) NOT NULL,
  `name`        VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `isDefault`   BOOLEAN NOT NULL DEFAULT false,
  `status`      VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
  -- NOT NULL with no DEFAULT: MySQL refuses a literal default on JSON before
  -- 8.0.13, and the application always writes this column anyway. The Postgres
  -- side is declared the same way so the two schemas stay byte-comparable.
  `layout`      JSON NOT NULL,
  `version`     INT NOT NULL DEFAULT 1,
  `createdAt`   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`   DATETIME(3) NOT NULL,
  `deletedAt`   DATETIME(3) NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `ClientForm_tenantId_name_key`
  ON `ClientForm`(`tenantId`, `name`);

CREATE INDEX `ClientForm_tenantId_deletedAt_idx`
  ON `ClientForm`(`tenantId`, `deletedAt`);

ALTER TABLE `ClientForm`
  ADD CONSTRAINT `ClientForm_tenantId_fkey`
  FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- No backfill, for the same reason as the Postgres migration: the starter form
-- is created lazily and stamped once by EnsureDefaultClientFormUseCase.
