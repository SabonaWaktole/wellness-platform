import { CompanyProfile } from '../../../../../src/clients/domain/value-objects/CompanyProfile';
import {
  BusinessTypeInactiveError,
  CityNotInAreaError,
  EmployeeCountInvalidError,
  WebsiteInvalidError,
} from '../../../../../src/clients/domain/errors';
import { businessType, area, city } from '../../../../support/fakeLookups';

describe('CompanyProfile', () => {
  const bt = businessType({ id: 'bt1', nameSq: 'Kafene', riskLevelId: 'rl1' });
  const tirana = area({ id: 'a1', nameSq: 'Tiranë' });
  const vlora = area({ id: 'a2', nameSq: 'Vlorë' });
  const tiranaCity = city({ id: 'c1', nameSq: 'Tiranë', areaId: 'a1' });

  const validInput = {
    businessTypeId: 'bt1',
    employeeCount: 5,
    areaId: 'a1',
    cityId: 'c1',
    streetAddress: 'Rr. Dëshmorët',
    taxId: 'K12345',
    website: 'https://acme.al',
  };
  const validLookups = { businessType: bt, area: tirana, city: tiranaCity };

  it('builds a valid profile', () => {
    const profile = CompanyProfile.create(validInput, validLookups);
    expect(profile.businessTypeId).toBe('bt1');
    expect(profile.employeeCount).toBe(5);
    expect(profile.website).toBe('https://acme.al');
  });

  it('rejects an inactive business type', () => {
    expect(() =>
      CompanyProfile.create(validInput, { ...validLookups, businessType: { ...bt, active: false } })
    ).toThrow(BusinessTypeInactiveError);
  });

  it('rejects a city from another area', () => {
    expect(() =>
      CompanyProfile.create({ ...validInput, areaId: 'a2' }, { ...validLookups, area: vlora })
    ).toThrow(CityNotInAreaError);
  });

  it('rejects an employee count below 1', () => {
    expect(() => CompanyProfile.create({ ...validInput, employeeCount: 0 }, validLookups)).toThrow(
      EmployeeCountInvalidError
    );
  });

  it('rejects a non-integer employee count', () => {
    expect(() => CompanyProfile.create({ ...validInput, employeeCount: 2.5 }, validLookups)).toThrow(
      EmployeeCountInvalidError
    );
  });

  it('rejects a malformed website', () => {
    expect(() => CompanyProfile.create({ ...validInput, website: 'not-a-url' }, validLookups)).toThrow(
      WebsiteInvalidError
    );
  });

  it('turns blank optional fields into null', () => {
    const profile = CompanyProfile.create({ ...validInput, streetAddress: '  ', taxId: '', website: null }, validLookups);
    expect(profile.streetAddress).toBeNull();
    expect(profile.taxId).toBeNull();
    expect(profile.website).toBeNull();
  });
});
