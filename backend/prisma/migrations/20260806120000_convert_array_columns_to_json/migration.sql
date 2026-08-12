-- Converts the four array-shaped columns to JSONB so their type matches
-- MySQL's schema.mysql.prisma mirror exactly (MySQL has no native array
-- column type). Uses `to_jsonb` in-place rather than drop+add so existing
-- row data survives the conversion. The existing `DEFAULT` on each column is
-- an array literal that Postgres cannot auto-cast to jsonb, so it has to be
-- dropped before the type change and re-added after.

-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "tags" DROP DEFAULT;
ALTER TABLE "Product"
  ALTER COLUMN "tags" TYPE JSONB USING to_jsonb("tags"),
  ALTER COLUMN "tags" SET DEFAULT '[]',
  ALTER COLUMN "tags" SET NOT NULL;

-- AlterTable
ALTER TABLE "CustomFieldDefinition"
  ALTER COLUMN "options" TYPE JSONB USING to_jsonb(COALESCE("options", ARRAY[]::TEXT[])),
  ALTER COLUMN "options" SET DEFAULT '[]',
  ALTER COLUMN "options" SET NOT NULL;

-- AlterTable
ALTER TABLE "NotificationSettings" ALTER COLUMN "emailEventTypes" DROP DEFAULT;
ALTER TABLE "NotificationSettings" ALTER COLUMN "emailRecipientRoles" DROP DEFAULT;
ALTER TABLE "NotificationSettings"
  ALTER COLUMN "emailEventTypes" TYPE JSONB USING to_jsonb("emailEventTypes"),
  ALTER COLUMN "emailEventTypes" SET DEFAULT '[]',
  ALTER COLUMN "emailEventTypes" SET NOT NULL,
  ALTER COLUMN "emailRecipientRoles" TYPE JSONB USING to_jsonb("emailRecipientRoles"),
  ALTER COLUMN "emailRecipientRoles" SET DEFAULT '["BUSINESS_OWNER"]',
  ALTER COLUMN "emailRecipientRoles" SET NOT NULL;
