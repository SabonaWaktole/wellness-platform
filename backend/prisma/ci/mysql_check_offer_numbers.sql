-- CI only: checks what the upgrade did to mysql_fixture_legacy_quotations.sql
-- (FR-OFR-08, NFR-OPS-02). Every row prints 'ok' or 'FAIL'; the job fails on
-- any 'FAIL'.

SELECT check_name, IF(passed, 'ok', 'FAIL') AS state FROM (
  SELECT 'every quotation has a number' AS check_name,
    (SELECT COUNT(*) FROM `Quotation` WHERE `number` IS NULL) = 0 AS passed
  UNION ALL SELECT 'no number is given twice in a workspace',
    (SELECT COUNT(*) FROM (
      SELECT `tenantId`, `number`, `version` FROM `Quotation`
      GROUP BY `tenantId`, `number`, `version` HAVING COUNT(*) > 1
    ) AS duplicates) = 0
  UNION ALL SELECT '2025 is numbered in createdAt order from 1',
    (SELECT `number` FROM `Quotation` WHERE `id` = 'ci-ofr-q1') <=> 'OF-2025-0001'
    AND (SELECT `number` FROM `Quotation` WHERE `id` = 'ci-ofr-q2') <=> 'OF-2025-0002'
  UNION ALL SELECT '2026 continues the existing counter',
    (SELECT `number` FROM `Quotation` WHERE `id` = 'ci-ofr-q3') <=> 'OF-2026-0003'
    AND (SELECT `number` FROM `Quotation` WHERE `id` = 'ci-ofr-q4') <=> 'OF-2026-0004'
  UNION ALL SELECT 'the counters move past the last number used',
    (SELECT `next` FROM `DocumentSequence` WHERE `tenantId` = 'ci-ofr-tenant' AND `kind` = 'OFFER' AND `year` = 2025) <=> 3
    AND (SELECT `next` FROM `DocumentSequence` WHERE `tenantId` = 'ci-ofr-tenant' AND `kind` = 'OFFER' AND `year` = 2026) <=> 5
  UNION ALL SELECT 'the workspace prefix is used',
    (SELECT `number` FROM `Quotation` WHERE `id` = 'ci-ofr-wa-q1') <=> 'WA-2026-0001'
  UNION ALL SELECT 'every quotation is version 1',
    (SELECT COUNT(*) FROM `Quotation` WHERE `tenantId` IN ('ci-ofr-tenant', 'ci-ofr-wa') AND `version` <> 1) = 0
  UNION ALL SELECT 'Wellness Albania runs the sales process',
    (SELECT `salesWorkflow` FROM `Tenant` WHERE `urlSlug` = 'wellness-albania') <=> 'SALES_PROCESS'
  UNION ALL SELECT 'other workspaces keep the legacy quotations',
    (SELECT `salesWorkflow` FROM `Tenant` WHERE `id` = 'ci-ofr-tenant') <=> 'LEGACY_QUOTATIONS'
) AS checks;
