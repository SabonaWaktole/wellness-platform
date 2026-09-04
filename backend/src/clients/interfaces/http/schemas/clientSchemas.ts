import { z } from 'zod';
import { InteractionChannel } from '../../../domain/enums/InteractionChannel';
import { FieldType } from '../../../domain/enums/FieldType';
import { FieldRole } from '../../../domain/enums/FieldRole';

// name/email/phone/status/assignedUserId are no longer top-level fields: a
// tenant can rename/retype/delete every client field (see FieldRole), so
// they now arrive as ordinary entries in customFieldValues, keyed by
// whatever the tenant currently calls them. Individual value validation
// (required-ness, email format, SINGLE_SELECT options, ...) happens
// domain-side in Client.create against the tenant's live definitions,
// since Zod can't know a per-tenant dynamic shape.
export const createClientSchema = z.object({
  customFieldValues: z.record(z.any()).optional(),
});

export const updateClientSchema = z.object({
  customFieldValues: z.record(z.any()).optional(),
});

export const searchClientsSchema = z.object({
  skip: z.coerce.number().min(0).default(0),
  take: z.coerce.number().min(1).max(100).default(50),
  /** Combined term matched against name, email and phone. */
  search: z.string().optional(),
  name: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  /** Free text: status is now a tenant-configurable SINGLE_SELECT, not a fixed enum. */
  status: z.string().optional(),
  assignedUserId: z.string().uuid().optional(),
  customFields: z.string().optional().transform((val) => {
    if (!val) return undefined;
    try {
      return JSON.parse(val);
    } catch {
      return undefined;
    }
  }),
});

export const addInteractionSchema = z.object({
  content: z.string().min(1, 'Content is required'),
  channel: z.nativeEnum(InteractionChannel),
  outcomeCategoryId: z.string().uuid().optional(),
});

export const defineCustomFieldSchema = z.object({
  fieldName: z
    .string()
    .trim()
    .min(1, 'Field name is required')
    .max(60, 'Field name must be 60 characters or fewer')
    // Trimmed before matching so " Size" and "Size " cannot slip past the
    // @@unique([tenantId, fieldName]) constraint as look-alike duplicates.
    .regex(
      /^[a-zA-Z0-9 _-]+$/,
      'Field name may contain letters, numbers, spaces, hyphens and underscores'
    ),
  fieldType: z.nativeEnum(FieldType),
  options: z.array(z.string()).optional(),
  role: z.nativeEnum(FieldRole).nullable().optional(),
  required: z.boolean().optional(),
}).refine(data => {
  if (data.fieldType === FieldType.SINGLE_SELECT && (!data.options || data.options.length === 0)) {
    return false;
  }
  return true;
}, {
  message: "Options are required for SINGLE_SELECT fields",
  path: ["options"],
});

export const updateCustomFieldSchema = z.object({
  fieldName: z
    .string()
    .trim()
    .min(1, 'Field name is required')
    .max(60, 'Field name must be 60 characters or fewer')
    .regex(
      /^[a-zA-Z0-9 _-]+$/,
      'Field name may contain letters, numbers, spaces, hyphens and underscores'
    )
    .optional(),
  fieldType: z.nativeEnum(FieldType).optional(),
  options: z.array(z.string()).optional(),
  role: z.nativeEnum(FieldRole).nullable().optional(),
  required: z.boolean().optional(),
});

export const reorderCustomFieldsSchema = z.object({
  orderedFieldIds: z.array(z.string().uuid()).min(1),
});

export const defineOutcomeCategorySchema = z.object({
  label: z.string().min(1, 'Label is required'),
});
