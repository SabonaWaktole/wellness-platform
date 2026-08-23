import { z } from 'zod';
import { ClientStatus } from '../../../domain/enums/ClientStatus';
import { InteractionChannel } from '../../../domain/enums/InteractionChannel';
import { FieldType } from '../../../domain/enums/FieldType';

export const createClientSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  status: z.nativeEnum(ClientStatus),
  assignedUserId: z.string().uuid().optional(),
  customFieldValues: z.record(z.any()).optional(),
});

export const updateClientSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  status: z.nativeEnum(ClientStatus).optional(),
  assignedUserId: z.string().uuid().nullable().optional(),
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
  status: z.nativeEnum(ClientStatus).optional(),
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
}).refine(data => {
  if (data.fieldType === FieldType.SINGLE_SELECT && (!data.options || data.options.length === 0)) {
    return false;
  }
  return true;
}, {
  message: "Options are required for SINGLE_SELECT fields",
  path: ["options"],
});

export const defineOutcomeCategorySchema = z.object({
  label: z.string().min(1, 'Label is required'),
});
