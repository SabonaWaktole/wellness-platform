import { checkFamilyLink } from './familyLink';

const base = { memberId: 'm', principalId: 'p', memberPrincipalId: null, principalPrincipalId: null, memberHasDependants: false };

describe('family link rules', () => {
  it('FR-FAM-03 a free member can be linked to a principal', () => {
    expect(checkFamilyLink(base)).toBeNull();
  });
  it('FR-FAM-03 nobody is linked to themselves', () => {
    expect(checkFamilyLink({ ...base, principalId: 'm' })).toBe('SELF_LINK');
  });
  it('FR-FAM-03 a principal cannot be a family member of another', () => {
    expect(checkFamilyLink({ ...base, principalPrincipalId: 'x' })).toBe('PRINCIPAL_IS_FAMILY_MEMBER');
  });
  it('FR-FAM-03, NFR-DAT-02 a member has one principal', () => {
    expect(checkFamilyLink({ ...base, memberPrincipalId: 'x' })).toBe('ALREADY_HAS_PRINCIPAL');
  });
  it('FR-FAM-03 a member who is a principal cannot become a family member', () => {
    expect(checkFamilyLink({ ...base, memberHasDependants: true })).toBe('MEMBER_IS_PRINCIPAL');
  });
});
