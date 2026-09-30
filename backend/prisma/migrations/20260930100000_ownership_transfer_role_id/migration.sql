-- Slice 15 (security review): ownership handovers now move User.roleId with
-- User.role. The acting owner's role before promotion is recorded so that
-- "restore original ownership" can give it back.

-- AlterTable
ALTER TABLE "OwnershipTransfer" ADD COLUMN "previousActingRoleId" TEXT;

-- Repair users the old handover code left inconsistent. The legacy mirror is
-- BUSINESS_OWNER exactly when the role is (or was copied from) Administrator.
-- 1. An owner demoted by "keep current ownership" was set to STAFF but kept
--    the Administrator role, and with it every Administrator permission.
UPDATE "User" u
SET "roleId" = sales."id"
FROM "Role" admin, "Role" sales
WHERE u."role" = 'STAFF'
  AND admin."tenantId" = u."tenantId" AND admin."key" = 'ADMINISTRATOR' AND admin."isSystem"
  AND u."roleId" = admin."id"
  AND sales."tenantId" = u."tenantId" AND sales."key" = 'SALES_USER' AND sales."isSystem";

-- 2. A stand-in promoted to BUSINESS_OWNER kept their old role, and so none
--    of the Administrator permissions the promotion was meant to give.
UPDATE "User" u
SET "roleId" = admin."id"
FROM "Role" admin, "Role" current
WHERE u."role" = 'BUSINESS_OWNER'
  AND admin."tenantId" = u."tenantId" AND admin."key" = 'ADMINISTRATOR' AND admin."isSystem"
  AND current."id" = u."roleId"
  AND current."key" <> 'ADMINISTRATOR'
  AND COALESCE(current."baseKey", '') <> 'ADMINISTRATOR';
