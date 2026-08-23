-- Profile and branding media.
--
-- All four columns are nullable and carry no default, so this migration is
-- purely additive: no existing row is rewritten and no data is lost.
--
-- IF NOT EXISTS keeps it idempotent. The dev database for this project had
-- previously drifted ahead of the migration history (firstName/lastName/phone/
-- warehouseId were applied out-of-band), so guarding every statement lets this
-- run cleanly whether or not a given environment already has the column.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "coverImageUrl" TEXT;

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "logoUrl" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "coverImageUrl" TEXT;
