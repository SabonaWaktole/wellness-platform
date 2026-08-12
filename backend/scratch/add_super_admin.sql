-- NevaCRM: add a platform SUPER_ADMIN directly via phpMyAdmin.
--
-- Run this on the Hostinger MySQL database, in the SQL tab.
--
-- SUPER_ADMIN sits outside every workspace (tenantId IS NULL), so there is
-- no in-app way to create one — this is the only path, matching
-- scratch/seed-super-admin.ts's own SQL-only mode, just in MySQL dialect
-- (backticks, no double-quoted identifiers) instead of the script's Postgres
-- output.
--
-- Email: sebonawaktole@gmail.com
-- Password: S@bon@W@ — near-identical to the hardcoded default already
-- flagged as compromised (it's sitting in git history). Fine as a one-time
-- bootstrap login, but change it from inside the app right after logging in
-- if this account is meant to stick around.
--
-- `User.email` has no unique constraint (see seed-super-admin.ts's own
-- comment on this), so nothing stops a duplicate at the database level.
-- Run this SELECT first to check one doesn't already exist for this email:
--
--   SELECT id, email, role FROM `User` WHERE email = 'sebonawaktole@gmail.com' AND role = 'SUPER_ADMIN';
--
-- If that returns a row, use the UPDATE at the bottom of this file instead
-- of the INSERT, so you don't end up with two accounts.

INSERT INTO `User` (`id`, `email`, `hashedPassword`, `firstName`, `lastName`, `role`, `tenantId`, `isActive`, `createdAt`)
VALUES (
  '779e34f7-e4ae-43e6-9301-64f1d032c747',
  'sebonawaktole@gmail.com',
  '$2b$10$hDXgrPWTOrBXfypthSmVT.cujRPIDTGI.PVhpcH4AebE0xaKLGkRq',
  'Platform',
  'Admin',
  'SUPER_ADMIN',
  NULL,
  true,
  NOW(3)
);

-- If a SUPER_ADMIN for this email already exists, use this instead of the
-- INSERT above (resets its password to the same one):
--
-- UPDATE `User` SET `hashedPassword` = '$2b$10$hDXgrPWTOrBXfypthSmVT.cujRPIDTGI.PVhpcH4AebE0xaKLGkRq', `isActive` = true
-- WHERE `email` = 'sebonawaktole@gmail.com' AND `role` = 'SUPER_ADMIN';
