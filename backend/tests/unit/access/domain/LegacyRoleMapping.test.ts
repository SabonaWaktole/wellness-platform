import { legacyRoleFor, legacyRoleKeyFor } from '../../../../src/access/domain/LegacyRoleMapping';
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

describe('legacyRoleFor (the reverse of D2)', () => {
  it('writes BUSINESS_OWNER for the Administrator and STAFF for every other role', () => {
    expect(legacyRoleFor('ADMINISTRATOR')).toBe('BUSINESS_OWNER');
    for (const key of ['SALES_USER', 'SALES_MANAGER', 'RECEPTION', 'CEO', 'CUSTOM_COPY']) {
      expect(legacyRoleFor(key)).toBe('STAFF');
    }
  });
});
