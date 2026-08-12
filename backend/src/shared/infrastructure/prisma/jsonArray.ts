import { Prisma } from '@prisma/client';

/**
 * The handful of array-shaped columns (Product.tags, CustomFieldDefinition.options,
 * NotificationSettings.emailEventTypes/emailRecipientRoles) are stored as `Json`
 * rather than a native array column, because MySQL — the Hostinger production
 * target — has no array column type. Prisma reads them back as `JsonValue`
 * (which includes `null` and scalars), so every read needs this same narrowing
 * before the rest of the app can treat them as `string[]`.
 */
export function jsonToStringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}
