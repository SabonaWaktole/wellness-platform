import { legacyRoleKeyFor } from '../../../../src/access/domain/LegacyRoleMapping';
import { RoleKey } from '../../../../src/access/domain/RoleKey';

describe('legacyRoleKeyFor (D2)', () => {
  it('maps BUSINESS_OWNER to Administrator', () => {
    expect(legacyRoleKeyFor('BUSINESS_OWNER')).toBe(RoleKey.Administrator);
  });

  it('maps STAFF to Sales User', () => {
    expect(legacyRoleKeyFor('STAFF')).toBe(RoleKey.SalesUser);
  });

  it('has no mapping for SUPER_ADMIN, which stays outside the role table', () => {
    expect(legacyRoleKeyFor('SUPER_ADMIN')).toBeNull();
  });
});
