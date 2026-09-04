import { UserRole } from '../../../auth/domain/enums/UserRole';

export type FormCapability =
  | 'forms:create'
  | 'forms:edit'
  | 'forms:delete'
  | 'forms:publish'
  | 'forms:manage_templates'
  | 'forms:view_submissions';

const CAPABILITY_ROLES: Record<FormCapability, ReadonlySet<UserRole>> = {
  'forms:create': new Set([UserRole.BUSINESS_OWNER, UserRole.SUPER_ADMIN]),
  'forms:edit': new Set([UserRole.BUSINESS_OWNER, UserRole.SUPER_ADMIN]),
  'forms:delete': new Set([UserRole.BUSINESS_OWNER, UserRole.SUPER_ADMIN]),
  'forms:publish': new Set([UserRole.BUSINESS_OWNER, UserRole.SUPER_ADMIN]),
  'forms:manage_templates': new Set([UserRole.BUSINESS_OWNER, UserRole.SUPER_ADMIN]),
  'forms:view_submissions': new Set([UserRole.BUSINESS_OWNER, UserRole.SUPER_ADMIN]),
};

/**
 * The single map from role to what it may do with forms (spec §31).
 *
 * Every builder/settings/submissions use case was repeating its own
 * `role !== BUSINESS_OWNER && role !== SUPER_ADMIN` inline — nine copies of
 * the same decision, easy to update eight of and miss the ninth. This is the
 * one place that decision lives now; a future role split (e.g. STAFF may
 * view but not delete) is a one-line change here instead of an audit of
 * every use case.
 *
 * Deliberately just `can()`, no `assert()`: each use case still throws its
 * own `DomainError` with its own message, so wording that already has test
 * coverage (and matches `FormController.statusFor`'s substring matching)
 * does not move. This is the fine-grained layer INSIDE what the route
 * middleware already enforces (STAFF may read, only an owner may write) —
 * not a second, competing permission system (brief §9).
 */
export const FormPermissions = {
  can(role: string, capability: FormCapability): boolean {
    return CAPABILITY_ROLES[capability].has(role as UserRole);
  },
};
