-- ============================================================================
-- Neva CRM — production MySQL migration, 2026-08-27  (RERUNNABLE)
--
-- Run this against the Hostinger production database BEFORE deploying the new
-- backend. That database is provisioned from nevacrm_full_import.sql rather
-- than Prisma's migration history, so `prisma migrate deploy` will not apply
-- any of this.
--
-- SAFE TO RUN MORE THAN ONCE. Every step checks whether it has already been
-- applied and skips itself if so, then reports what it did in a final summary.
-- This replaces an earlier version that aborted with
-- "#1060 Duplicate column name" when part of the work was already present.
--
-- Covers three Prisma migrations:
--   20260827120000_add_tenant_client_fields_seeded_at
--   20260827130000_add_client_soft_delete
--   20260827140000_add_client_notes
--
-- Additive only: three nullable columns and one index. No row loses data and
-- no existing column changes meaning.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tenant.clientFieldsSeededAt
--
-- Makes baseline client-field seeding a one-time event per workspace. Fixes
-- deleted fields (Email, Phone, ...) reappearing at the bottom of the list.
-- ---------------------------------------------------------------------------
SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Tenant'
    AND COLUMN_NAME = 'clientFieldsSeededAt'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `Tenant` ADD COLUMN `clientFieldsSeededAt` DATETIME(3) NULL',
  'SELECT ''skipped: Tenant.clientFieldsSeededAt already exists'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill: any workspace that already has a roled custom field has been
-- through the seeder, so mark it seeded. Restricted to rows still NULL, so
-- re-running never re-stamps a workspace with a later timestamp.
UPDATE `Tenant` t
SET t.`clientFieldsSeededAt` = NOW(3)
WHERE t.`clientFieldsSeededAt` IS NULL
  AND EXISTS (
    SELECT 1 FROM `CustomFieldDefinition` c
    WHERE c.`tenantId` = t.`id` AND c.`role` IS NOT NULL
  );

-- ---------------------------------------------------------------------------
-- 2. Client.deletedAt  (soft delete / archive)
--
-- A hard DELETE is impossible: Interaction, Appointment, Quotation and Invoice
-- each hold a non-nullable clientId with no cascade rule. NULL means active,
-- which is what every existing client already is.
-- ---------------------------------------------------------------------------
SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Client'
    AND COLUMN_NAME = 'deletedAt'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `Client` ADD COLUMN `deletedAt` DATETIME(3) NULL',
  'SELECT ''skipped: Client.deletedAt already exists'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Client'
    AND INDEX_NAME = 'Client_tenantId_deletedAt_idx'
);
SET @sql := IF(@exists = 0,
  'CREATE INDEX `Client_tenantId_deletedAt_idx` ON `Client`(`tenantId`, `deletedAt`)',
  'SELECT ''skipped: Client_tenantId_deletedAt_idx already exists'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- 3. Client.notes  (the "Paragraph" field)
--
-- A real column rather than a tenant-defined custom field: it is a system
-- concern the workspace cannot rename or delete.
-- ---------------------------------------------------------------------------
SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Client'
    AND COLUMN_NAME = 'notes'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `Client` ADD COLUMN `notes` TEXT NULL',
  'SELECT ''skipped: Client.notes already exists'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- Summary — every row must read OK before you deploy the backend.
-- ---------------------------------------------------------------------------
SELECT 'Tenant.clientFieldsSeededAt' AS item,
       IF(COUNT(*) > 0, 'OK', 'STILL MISSING') AS state
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Tenant' AND COLUMN_NAME = 'clientFieldsSeededAt'
UNION ALL
SELECT 'Client.deletedAt', IF(COUNT(*) > 0, 'OK', 'STILL MISSING')
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Client' AND COLUMN_NAME = 'deletedAt'
UNION ALL
SELECT 'Client_tenantId_deletedAt_idx', IF(COUNT(*) > 0, 'OK', 'STILL MISSING')
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Client' AND INDEX_NAME = 'Client_tenantId_deletedAt_idx'
UNION ALL
SELECT 'Client.notes', IF(COUNT(*) > 0, 'OK', 'STILL MISSING')
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Client' AND COLUMN_NAME = 'notes';
