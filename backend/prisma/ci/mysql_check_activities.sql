-- CI only: checks what the upgrade did to mysql_fixture_legacy_interactions.sql
-- (FR-ACT-07, NFR-OPS-02). Every row prints 'ok' or 'FAIL'; the job fails on
-- any 'FAIL'.

SELECT check_name, IF(passed, 'ok', 'FAIL') AS state FROM (
  SELECT 'every legacy interaction is kept' AS check_name,
    (SELECT COUNT(*) FROM `Interaction` WHERE tenantId = 'ci-act-tenant') = 3 AS passed
  UNION ALL SELECT 'occurredAt is the creation date',
    (SELECT COUNT(*) FROM `Interaction` WHERE tenantId = 'ci-act-tenant'
      AND occurredAt IS NOT NULL AND occurredAt = createdAt) = 3
  UNION ALL SELECT 'a legacy label is copied and keeps its id',
    (SELECT COUNT(*) FROM `ActivityResult` WHERE id = 'ci-act-oc-legacy'
      AND tenantId = 'ci-act-tenant' AND nameSq = 'Interested (legacy)' AND `order` = 7) = 1
  UNION ALL SELECT 'the call keeps its result',
    (SELECT resultId FROM `Interaction` WHERE id = 'ci-act-i1') <=> 'ci-act-oc-legacy'
  UNION ALL SELECT 'a label equal to a default maps to the default',
    (SELECT i.resultId FROM `Interaction` i WHERE i.id = 'ci-act-i2') <=>
    (SELECT a.id FROM `ActivityResult` a WHERE a.tenantId = 'ci-act-tenant' AND a.nameSq = 'Nuk u kontaktua' AND a.`order` = 3)
  UNION ALL SELECT 'an interaction without a category has no result',
    (SELECT resultId FROM `Interaction` WHERE id = 'ci-act-i3') IS NULL
  UNION ALL SELECT 'the workspace has the six defaults and one legacy result',
    (SELECT COUNT(*) FROM `ActivityResult` WHERE tenantId = 'ci-act-tenant') = 7
  UNION ALL SELECT 'the old column is kept',
    (SELECT COUNT(*) FROM `Interaction` WHERE tenantId = 'ci-act-tenant' AND outcomeCategoryId IS NOT NULL) = 2
) AS checks;
