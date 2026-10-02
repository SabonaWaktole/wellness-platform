-- CI only (the `mysql` job, FR-ACT-07, NFR-OPS-02): a workspace with
-- interactions recorded the way they were before Milestone 2 Slice 7, with
-- every Slice 7 column left NULL. It is loaded between the two upgrade runs,
-- so the second run has to migrate it; mysql_check_activities.sql then checks
-- the result. Never run this against a real database.

INSERT INTO `Tenant` (`id`, `name`, `urlSlug`) VALUES ('ci-act-tenant', 'CI legacy activities', 'ci-act-legacy');

INSERT INTO `User` (`id`, `email`, `hashedPassword`, `role`, `tenantId`)
VALUES ('ci-act-user', 'ci-act@example.invalid', 'not-a-hash', 'STAFF', 'ci-act-tenant');

INSERT INTO `Client` (`id`, `tenantId`, `customFieldValues`, `lastUpdatedByUserId`, `updatedAt`)
VALUES ('ci-act-client', 'ci-act-tenant', JSON_OBJECT(), 'ci-act-user', NOW(3));

-- One label that is not a default, and one that is (it must map to the
-- default instead of being copied a second time).
INSERT INTO `OutcomeCategory` (`id`, `tenantId`, `label`) VALUES
  ('ci-act-oc-legacy', 'ci-act-tenant', 'Interested (legacy)'),
  ('ci-act-oc-default', 'ci-act-tenant', 'Nuk u kontaktua');

INSERT INTO `Interaction` (`id`, `tenantId`, `clientId`, `authorUserId`, `content`, `channel`, `outcomeCategoryId`, `createdAt`) VALUES
  ('ci-act-i1', 'ci-act-tenant', 'ci-act-client', 'ci-act-user', 'Legacy call', 'CALL', 'ci-act-oc-legacy', '2026-03-01 09:15:00.000'),
  ('ci-act-i2', 'ci-act-tenant', 'ci-act-client', 'ci-act-user', 'Legacy meeting', 'MEETING', 'ci-act-oc-default', '2026-04-02 10:30:00.000'),
  ('ci-act-i3', 'ci-act-tenant', 'ci-act-client', 'ci-act-user', 'Legacy note', 'NOTE', NULL, '2026-05-03 11:45:00.000');
