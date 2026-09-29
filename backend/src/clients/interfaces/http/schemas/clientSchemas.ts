import { z } from 'zod';
import { PermissionScope } from '../../../../access/domain/PermissionScope';
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

/**
 * The Slice 11 company profile (FR-CMP-01, 02, 03). Required on both create
 * and update — the company form always sends it — but not by
 * ImportClientsUseCase or the public-form path, which build the use case DTO
 * directly rather than through these schemas.
 */
const companyProfileSchema = z.object({
  businessTypeId: z.string().min(1, 'Choose a business type.'),
  employeeCount: z.coerce.number().int().min(1),
  areaId: z.string().min(1, 'Choose an area.'),
  cityId: z.string().min(1, 'Choose a city.'),
  streetAddress: z.string().max(200).nullish(),
  taxId: z.string().max(50).nullish(),
  website: z.string().max(200).nullish(),
});

/** One contact on the company form (FR-CMP-04). Server-side validation (name required, at
 *  least a phone or email) happens domain-side in ContactPerson.create/CompanyContacts.create. */
export const contactPersonInputSchema = z.object({
  name: z.string().min(1).max(200),
  position: z.string().max(120).nullish(),
  phone: z.string().max(40).nullish(),
  email: z.string().max(200).nullish(),
  isPrimary: z.boolean().optional(),
});

export const createClientSchema = z.object({
  customFieldValues: z.record(z.any()).optional(),
  notes: clientNotes,
  profile: companyProfileSchema.optional(),
  /** Required only on the company-form path — see createClientHttpSchema below. */
  contacts: z.array(contactPersonInputSchema).optional(),
});

export const updateClientSchema = z.object({
  customFieldValues: z.record(z.any()).optional(),
  notes: clientNotes,
  profile: companyProfileSchema.optional(),
});

/**
 * The shape the company form submits to create a company: everything
 * createClientSchema accepts, but with the Slice 11 profile required. Used
 * only by the authenticated create HTTP route — not by ImportClientsUseCase
 * or the public-form path, which build their DTOs without a profile
 * (decision: those keep creating incomplete companies for Slice 14 to
 * report on).
 *
 * An edit has no equivalent stricter schema: like `notes` and
 * `customFieldValues`, an update that omits `profile` leaves the company's
 * existing one untouched (UpdateClientUseCase), so re-sending it on every
 * unrelated edit was never required.
 */
export const createClientHttpSchema = createClientSchema.extend({
  profile: companyProfileSchema,
  contacts: z.array(contactPersonInputSchema).min(1, 'Add at least one contact person.'),
});

export const addContactPersonSchema = contactPersonInputSchema.omit({ isPrimary: true });

export const updateContactPersonSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  position: z.string().max(120).nullish(),
  phone: z.string().max(40).nullish(),
  email: z.string().max(200).nullish(),
});

export const removeContactPersonSchema = z.object({
  newPrimaryContactId: z.string().uuid().optional(),
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
  /** Slice 11 filters (FR-CMP-06). `riskLevelId` narrows through the business type. */
  businessTypeId: z.string().optional(),
  riskLevelId: z.string().optional(),
  areaId: z.string().optional(),
  cityId: z.string().optional(),
  /**
   * The list's "mine / team / all" filter (FR-RBAC-11..13). It narrows the
   * viewer's `companies.view` scope and never widens it.
   */
  reach: z.nativeEnum(PermissionScope).optional(),
  /**
   * `?archived=true` returns the tenant's archived clients instead of its
   * active ones — the Clients page's "Archived" view. Absent/false keeps the
   * default active-only behaviour every existing caller relies on.
   *
   * NOT `z.coerce.boolean()`. That is `Boolean(value)`, and every non-empty
   * string is truthy — so the literal `"false"` axios puts on the wire for
   * `{ archived: false }` parsed as TRUE, and the Clients tab asked for
   * ARCHIVED clients on every load. The active list came back empty for every
   * workspace that had not archived anything, which is to say: the clients
   * were invisible. Only an explicit affirmative counts here.
   */
  archived: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      if (typeof value === 'boolean') return value;
      const normalised = value.trim().toLowerCase();
      return normalised === 'true' || normalised === '1';
    }),
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
