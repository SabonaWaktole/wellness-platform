-- M2 Slice 3 follow-up: PriceZoneCity's City key cascades instead of
-- restricting. Deleting a workspace cascades to City and PriceZone in no fixed
-- order, and Postgres checks a RESTRICT key inside each cascade step, so a
-- workspace with price zones could not be deleted by a plain tenant delete.
-- A city in a zone still cannot be deleted through the app: the lookup
-- in-use policy counts it (FR-PCF-05).

-- DropForeignKey
ALTER TABLE "PriceZoneCity" DROP CONSTRAINT "PriceZoneCity_cityId_fkey";

-- AddForeignKey
ALTER TABLE "PriceZoneCity" ADD CONSTRAINT "PriceZoneCity_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;
