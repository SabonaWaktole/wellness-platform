-- Read-only. Tells you exactly which parts of the 2026-08-27 migration are
-- already applied. Safe to run any number of times; changes nothing.
SELECT 'Tenant.clientFieldsSeededAt' AS item,
       IF(COUNT(*) > 0, 'ALREADY APPLIED', 'MISSING') AS state
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Tenant' AND COLUMN_NAME = 'clientFieldsSeededAt'
UNION ALL
SELECT 'Client.deletedAt',
       IF(COUNT(*) > 0, 'ALREADY APPLIED', 'MISSING')
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Client' AND COLUMN_NAME = 'deletedAt'
UNION ALL
SELECT 'Client_tenantId_deletedAt_idx',
       IF(COUNT(*) > 0, 'ALREADY APPLIED', 'MISSING')
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Client' AND INDEX_NAME = 'Client_tenantId_deletedAt_idx'
UNION ALL
SELECT 'Client.notes',
       IF(COUNT(*) > 0, 'ALREADY APPLIED', 'MISSING')
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Client' AND COLUMN_NAME = 'notes';
