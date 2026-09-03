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
/**
 * `notes` IS a top-level field, unlike name/email/phone/status: it is a system
 * concern the tenant cannot rename or delete, so it is not part of the
 * per-tenant custom-field shape. Capped to keep a runaway paste from bloating
 * every client read.
 */
const clientNotes = z.string().max(10000).nullish();

export const createClientSchema = z.object({
  customFieldValues: z.record(z.any()).optional(),
  notes: clientNotes,
});

export const updateClientSchema = z.object({
  customFieldValues: z.record(z.any()).optional(),
  notes: clientNotes,
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
  /**
   * `?archived=true` returns the tenant's archived clients instead of its
   * active ones — the Clients page's "Archived" view. Absent/false keeps the
   * default active-only behaviour every existing caller relies on.
   */
  archived: z.coerce.boolean().optional(),
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
  const needsOptions =
    data.fieldType === FieldType.SINGLE_SELECT || data.fieldType === FieldType.MULTI_SELECT;
  if (needsOptions && (!data.options || data.options.length === 0)) {
    return false;
  }
  return true;
}, {
  message: "Options are required for SINGLE_SELECT and MULTI_SELECT fields",
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
