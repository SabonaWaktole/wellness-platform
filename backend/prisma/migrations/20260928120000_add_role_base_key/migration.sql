-- Slice 6 (FR-RBAC-04): a custom role remembers the system role it was copied
-- from, so Team scope and the legacy User.role string treat it as that role.
-- NULL for the five system roles; no existing row needs a value.
ALTER TABLE "Role" ADD COLUMN     "baseKey" TEXT;
