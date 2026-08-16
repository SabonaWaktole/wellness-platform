-- Interface language.
--
-- Deliberately NOT part of the localization group added in the previous
-- migration (currency/locale/timezone/dateFormat). Those govern *formatting*;
-- this governs which language the interface is written in. They are independent:
-- a user may read the app in Albanian while their workspace still records money
-- and dates in US conventions.

-- Workspace default. NOT NULL with a default, like the formatting group: the
-- fallback lives in the column rather than in each consumer.
--
-- It exists even though the SRS asks for a user-level setting, because
-- invitation and password-reset emails are sent to people who have no account
-- yet — there is no user preference to read, so the tenant default is the only
-- possible source of language for them.
ALTER TABLE "Tenant" ADD COLUMN "defaultLanguage" TEXT NOT NULL DEFAULT 'en';

-- Per-user override.
--
-- NULLABLE on purpose, and the nullability carries meaning: NULL is "follow the
-- workspace default", which is genuinely different from "explicitly chose
-- English". With NOT NULL DEFAULT 'en', a workspace switching its default to
-- Albanian would leave every existing user pinned to English with no way to tell
-- whether that was a choice or an artefact of the migration.
ALTER TABLE "User" ADD COLUMN "language" TEXT;
