import { FormPermissions, FormCapability } from '../../../../../src/forms/domain/services/FormPermissions';
import { UserRole } from '../../../../../src/auth/domain/enums/UserRole';

const CAPABILITIES: FormCapability[] = [
  'forms:create',
  'forms:edit',
  'forms:delete',
  'forms:publish',
  'forms:manage_templates',
  'forms:view_submissions',
];

describe('FormPermissions', () => {
  it.each(CAPABILITIES)('allows BUSINESS_OWNER for %s', (capability) => {
    expect(FormPermissions.can(UserRole.BUSINESS_OWNER, capability)).toBe(true);
  });

  it.each(CAPABILITIES)('allows SUPER_ADMIN for %s', (capability) => {
    expect(FormPermissions.can(UserRole.SUPER_ADMIN, capability)).toBe(true);
  });

  it.each(CAPABILITIES)('denies STAFF for %s', (capability) => {
    expect(FormPermissions.can(UserRole.STAFF, capability)).toBe(false);
  });

  it('denies an unrecognised role string', () => {
    expect(FormPermissions.can('NOT_A_ROLE', 'forms:edit')).toBe(false);
  });
});
