-- CI only (the `mysql` job, FR-OFR-08, NFR-OPS-02): quotations created the
-- way they were before Milestone 2 Slice 9, with no number. It is loaded
-- between the two upgrade runs, so the second run has to number them;
-- mysql_check_offer_numbers.sql then checks the result. Never run this
-- against a real database.
--
-- ci-ofr-tenant has no pricing settings (prefix OF) and a 2026 counter that
-- has already handed out two numbers. ci-ofr-wa stands in for Wellness
-- Albania: its slug switches it to the sales process, and its prefix is WA.

INSERT INTO `Tenant` (`id`, `name`, `urlSlug`) VALUES
  ('ci-ofr-tenant', 'CI legacy quotations', 'ci-ofr-legacy'),
  ('ci-ofr-wa', 'CI Wellness Albania', 'wellness-albania');

INSERT INTO `User` (`id`, `email`, `hashedPassword`, `role`, `tenantId`) VALUES
  ('ci-ofr-user', 'ci-ofr@example.invalid', 'not-a-hash', 'STAFF', 'ci-ofr-tenant'),
  ('ci-ofr-wa-user', 'ci-ofr-wa@example.invalid', 'not-a-hash', 'STAFF', 'ci-ofr-wa');

INSERT INTO `Client` (`id`, `tenantId`, `customFieldValues`, `lastUpdatedByUserId`, `updatedAt`) VALUES
  ('ci-ofr-client', 'ci-ofr-tenant', JSON_OBJECT(), 'ci-ofr-user', NOW(3)),
  ('ci-ofr-wa-client', 'ci-ofr-wa', JSON_OBJECT(), 'ci-ofr-wa-user', NOW(3));

INSERT INTO `PricingSettings` (`tenantId`, `offerNumberPrefix`, `updatedAt`) VALUES ('ci-ofr-wa', 'WA', NOW(3));

INSERT INTO `DocumentSequence` (`tenantId`, `kind`, `year`, `next`) VALUES ('ci-ofr-tenant', 'OFFER', 2026, 3);

-- Listed out of order on purpose: numbers follow createdAt, not insertion.
INSERT INTO `Quotation` (`id`, `tenantId`, `clientId`, `createdByUserId`, `status`, `createdAt`, `updatedAt`) VALUES
  ('ci-ofr-q4', 'ci-ofr-tenant', 'ci-ofr-client', 'ci-ofr-user', 'SENT', '2026-03-01 10:00:00.000', NOW(3)),
  ('ci-ofr-q1', 'ci-ofr-tenant', 'ci-ofr-client', 'ci-ofr-user', 'ACCEPTED', '2025-02-01 10:00:00.000', NOW(3)),
  ('ci-ofr-q3', 'ci-ofr-tenant', 'ci-ofr-client', 'ci-ofr-user', 'DRAFT', '2026-01-10 10:00:00.000', NOW(3)),
  ('ci-ofr-q2', 'ci-ofr-tenant', 'ci-ofr-client', 'ci-ofr-user', 'EXPIRED', '2025-06-01 10:00:00.000', NOW(3)),
  ('ci-ofr-wa-q1', 'ci-ofr-wa', 'ci-ofr-wa-client', 'ci-ofr-wa-user', 'DRAFT', '2026-05-05 10:00:00.000', NOW(3));
