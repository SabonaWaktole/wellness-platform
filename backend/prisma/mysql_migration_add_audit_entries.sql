-- Wellness Albania — add the AuditEntry table to a live MySQL database.
--
-- SAFE TO RUN ON PRODUCTION, AND SAFE TO RUN TWICE. This is additive: one new
-- table, no foreign keys, so there is nothing here for a re-run to lose.
-- `CREATE TABLE IF NOT EXISTS` covers the re-run on its own; there is no
-- guarded ALTER TABLE step because AuditEntry has no foreign keys at all
-- (deliberately — see the model comment in schema.mysql.prisma).
--
-- The same statement is also carried by mysql_upgrade_to_current.sql, which
-- is the file to run when bringing a database up to date generally. This one
-- exists for applying just this table on its own.
--
-- TAKE A BACKUP FIRST:
--   mysqldump -u USER -p --single-transaction --routines DBNAME > backup.sql

SELECT 'adding AuditEntry table' AS step, DATABASE() AS db, NOW() AS at;

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

-- ---------------------------------------------------------------
-- Migration-history bookkeeping, so a later `prisma migrate deploy`
-- recognises this work as already applied rather than trying to redo it.
-- ---------------------------------------------------------------
INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20260927101159_add_audit_entries', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20260927101159_add_audit_entries'
);

-- ---------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------
SELECT item, IF(present > 0, 'OK', 'STILL MISSING') AS state FROM (
  SELECT 'AuditEntry table' AS item, COUNT(*) AS present FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='AuditEntry'
) AS checks;

SELECT 'AuditEntry table ready' AS step, NOW() AS at;
