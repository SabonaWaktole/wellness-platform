-- Phase 5 (versioning & publishing): one additive nullable column.
--
-- Records the draft `version` counter's value at the moment of the last
-- publish, so "has unpublished changes" is a cheap integer comparison
-- (`version > publishedAtDraftVersion`) rather than diffing the draft
-- document against the frozen FormVersion snapshot on every read.
--
-- Mirrors prisma/migrations/20260903121659_add_published_at_draft_version
-- for the Hostinger MySQL database, which is hand-maintained (schema.mysql.prisma
-- is not migrated by Prisma against that provider).

ALTER TABLE `ClientForm` ADD COLUMN `publishedAtDraftVersion` INT NULL;
