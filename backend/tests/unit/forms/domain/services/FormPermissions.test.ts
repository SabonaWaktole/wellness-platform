import { FormPermissions, FormCapability } from '../../../../../src/forms/domain/services/FormPermissions';
import { PermissionDeniedError } from '../../../../../src/access/domain/errors';
import { accessWith, administrator, platformOperator, salesManager, salesUser } from '../../../../support/access';

const CAPABILITIES: FormCapability[] = [
  'forms:create',
  'forms:edit',
  'forms:delete',
  'forms:publish',
  'forms:manage_templates',
  'forms:view_submissions',
];

describe('FormPermissions', () => {
  it.each(CAPABILITIES)('allows the Administrator (forms.manage) for %s', (capability) => {
    expect(FormPermissions.can(administrator(), capability)).toBe(true);
  });

  it.each(CAPABILITIES)('allows the platform operator for %s', (capability) => {
    expect(FormPermissions.can(platformOperator(), capability)).toBe(true);
  });

  it.each(CAPABILITIES)('denies a Sales User for %s', (capability) => {
    expect(FormPermissions.can(salesUser(), capability)).toBe(false);
  });

  it('FR-RBAC-05 follows forms.manage, not the role name', () => {
    expect(FormPermissions.can(accessWith({ 'forms.manage': true }), 'forms:publish')).toBe(true);
    expect(FormPermissions.can(salesManager(), 'forms:publish')).toBe(false);
  });

  it('ensure() throws PermissionDeniedError for a caller without forms.manage', () => {
    expect(() => FormPermissions.ensure(salesUser(), 'forms:edit')).toThrow(PermissionDeniedError);
    expect(() => FormPermissions.ensure(administrator(), 'forms:edit')).not.toThrow();
  });
});
