import { AccessContext } from '../../../access/domain/AccessContext';

export type FormCapability =
  | 'forms:create'
  | 'forms:edit'
  | 'forms:delete'
  | 'forms:publish'
  | 'forms:manage_templates'
  | 'forms:view_submissions';

/**
 * Every form capability is one catalogue key today (D8: the forms module
 * sits behind a single coarse `forms.manage`). Kept as a map so a finer
 * split later — e.g. a key for viewing submissions only — is a one-line
 * change here, not an audit of every use case.
 */
const CAPABILITY_PERMISSION: Record<FormCapability, string> = {
  'forms:create': 'forms.manage',
  'forms:edit': 'forms.manage',
  'forms:delete': 'forms.manage',
  'forms:publish': 'forms.manage',
  'forms:manage_templates': 'forms.manage',
  'forms:view_submissions': 'forms.manage',
};

/**
 * What a caller may do with forms (spec §31), read from their permissions
 * (FR-RBAC-05). This is the fine-grained layer INSIDE what the route
 * middleware already enforces — not a second, competing permission system
 * (brief §9).
 */
export const FormPermissions = {
  can(access: AccessContext, capability: FormCapability): boolean {
    return access.can(CAPABILITY_PERMISSION[capability]);
  },

  /** Throws `PermissionDeniedError` unless `access` may use `capability`. */
  ensure(access: AccessContext, capability: FormCapability): void {
    access.ensure(CAPABILITY_PERMISSION[capability]);
  },
};
