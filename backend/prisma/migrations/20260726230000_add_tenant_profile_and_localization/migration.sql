-- Company profile. Presentation-only strings with no domain behaviour, so they
-- are read directly from Prisma and deliberately kept OFF the Tenant domain
-- entity, following the precedent set by logoUrl/coverImageUrl.
--
-- All nullable: every existing tenant has none of these, and there is no value
-- we could invent for someone else's registered address.
ALTER TABLE "Tenant" ADD COLUMN "registrationNumber" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "addressLine"        TEXT;
ALTER TABLE "Tenant" ADD COLUMN "addressCity"        TEXT;
ALTER TABLE "Tenant" ADD COLUMN "addressState"       TEXT;
ALTER TABLE "Tenant" ADD COLUMN "addressPostalCode"  TEXT;
ALTER TABLE "Tenant" ADD COLUMN "contactEmail"       TEXT;
ALTER TABLE "Tenant" ADD COLUMN "contactPhone"       TEXT;

-- Localization. These ARE consumed by real logic (money formatting today,
-- notifications later), so they live on the domain entity.
--
-- NOT NULL with a default rather than nullable: it means no consumer writes its
-- own `?? 'USD'`, so the fallback exists in exactly one place -- here -- instead
-- of drifting across nine call sites.
--
-- 'USD' and 'en-US' reproduce what the hard-coded formatters already rendered,
-- so existing tenants see no change on deploy. 'UTC' is chosen over the
-- disabled UI's America/Los_Angeles because a neutral default is honest about
-- not knowing, whereas guessing Pacific time would be wrong for most tenants.
ALTER TABLE "Tenant" ADD COLUMN "currency"   TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "Tenant" ADD COLUMN "locale"     TEXT NOT NULL DEFAULT 'en-US';
ALTER TABLE "Tenant" ADD COLUMN "timezone"   TEXT NOT NULL DEFAULT 'UTC';
ALTER TABLE "Tenant" ADD COLUMN "dateFormat" TEXT NOT NULL DEFAULT 'MM/DD/YYYY';
