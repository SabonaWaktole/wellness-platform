-- Read-only pre-flight check. Run this against production BEFORE applying
-- mysql_migration_add_custom_field_role_order.sql, to see whether any tenant
-- already has a custom field named exactly like one of the 5 fields the new
-- code will try to auto-create (Name/Email/Phone/Status/Assigned To). If a
-- row comes back, that tenant's field of that name won't be auto-upgraded to
-- carry a role — nothing is lost, just something to know about ahead of time.

SELECT tenantId, fieldName, fieldType
FROM CustomFieldDefinition
WHERE fieldName IN ('Name', 'Email', 'Phone', 'Status', 'Assigned To');
