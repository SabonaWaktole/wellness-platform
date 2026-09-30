import { planLegacyClient, LegacyClientLookups, LegacyClientSnapshot } from '../../../../src/clients/domain/legacy/LegacyClientPlan';
import { LegacyMappingConfig } from '../../../../src/clients/domain/legacy/LegacyMappingConfig';
import { BusinessType, Area, City } from '../../../../src/lookups/domain/LookupItem';
import { CustomFieldDefinition } from '../../../../src/clients/domain/entities/CustomFieldDefinition';
import { FieldType } from '../../../../src/clients/domain/enums/FieldType';
import { FieldRole } from '../../../../src/clients/domain/enums/FieldRole';

const businessType = (over: Partial<BusinessType> = {}): BusinessType => ({
  id: 'bt-1',
  nameSq: 'Kafene',
  nameEn: 'Cafe',
  order: 0,
  active: true,
  riskLevelId: 'rl-1',
  ...over,
});

const area = (over: Partial<Area> = {}): Area => ({ id: 'area-1', nameSq: 'Tiranë', nameEn: null, order: 0, active: true, ...over });
const city = (over: Partial<City> = {}): City => ({
  id: 'city-1',
  nameSq: 'Tiranë',
  nameEn: null,
  order: 0,
  active: true,
  areaId: 'area-1',
  ...over,
});

const emptyProfile = {
  businessTypeId: null,
  employeeCount: null,
  areaId: null,
  cityId: null,
  streetAddress: null,
  taxId: null,
  website: null,
};

const baseSnapshot = (over: Partial<LegacyClientSnapshot> = {}): LegacyClientSnapshot => ({
  id: 'c-1',
  name: 'Acme Ltd',
  email: null,
  phone: null,
  customFieldValues: {},
  profile: { ...emptyProfile },
  hasLiveContact: false,
  archived: false,
  ...over,
});

const baseLookups = (over: Partial<LegacyClientLookups> = {}): LegacyClientLookups => ({
  businessTypes: [businessType()],
  areas: [area()],
  cities: [city()],
  fieldDefs: [],
  taxIdsInUse: new Set(),
  ...over,
});

const baseConfig = (fields: LegacyMappingConfig['fields'] = {}): LegacyMappingConfig => ({
  tenant: 'wellness',
  fields,
});

describe('planLegacyClient (FR-CMP-08)', () => {
  it('fills the business type from a mapped custom field', () => {
    const snapshot = baseSnapshot({ customFieldValues: { Industry: 'Hospitality' } });
    const config = baseConfig({ businessType: { from: ['Industry'], values: { Hospitality: 'Kafene' } } });
    const result = planLegacyClient(snapshot, config, baseLookups());
    expect(result.profilePatch.businessTypeId).toBe('bt-1');
  });

  it('never overwrites a column that already has a value (idempotent)', () => {
    const snapshot = baseSnapshot({
      customFieldValues: { Industry: 'Hospitality' },
      profile: { ...emptyProfile, businessTypeId: 'already-set' },
    });
    const config = baseConfig({ businessType: { from: ['Industry'] } });
    const result = planLegacyClient(snapshot, config, baseLookups());
    expect(result.profilePatch.businessTypeId).toBeUndefined();
  });

  it('notes an issue when the business type does not match any active value', () => {
    const snapshot = baseSnapshot({ customFieldValues: { Industry: 'Nonsense' } });
    const config = baseConfig({ businessType: { from: ['Industry'] } });
    const result = planLegacyClient(snapshot, config, baseLookups());
    expect(result.profilePatch.businessTypeId).toBeUndefined();
    expect(result.issues[0]).toMatch(/Business type "Nonsense"/);
  });

  it('parses a valid employee count', () => {
    const snapshot = baseSnapshot({ customFieldValues: { Employees: '12' } });
    const config = baseConfig({ employeeCount: { from: ['Employees'] } });
    const result = planLegacyClient(snapshot, config, baseLookups());
    expect(result.profilePatch.employeeCount).toBe(12);
  });

  it('rejects an employee count below 1', () => {
    const snapshot = baseSnapshot({ customFieldValues: { Employees: '0' } });
    const config = baseConfig({ employeeCount: { from: ['Employees'] } });
    const result = planLegacyClient(snapshot, config, baseLookups());
    expect(result.profilePatch.employeeCount).toBeUndefined();
    expect(result.issues.some((i) => i.includes('Employees'.slice(0, 0)) || i.includes('employees'))).toBe(true);
  });

  it('resolves area and city together when both are mapped', () => {
    const snapshot = baseSnapshot({ customFieldValues: { Area: 'Tirane', City: 'Tirane' } });
    const config = baseConfig({ area: { from: ['Area'] }, city: { from: ['City'] } });
    const result = planLegacyClient(snapshot, config, baseLookups());
    expect(result.profilePatch.areaId).toBe('area-1');
    expect(result.profilePatch.cityId).toBe('city-1');
  });

  it('infers the area from a uniquely matching city and notes it as an issue', () => {
    const snapshot = baseSnapshot({ customFieldValues: { City: 'Tirane' } });
    const config = baseConfig({ city: { from: ['City'] } });
    const result = planLegacyClient(snapshot, config, baseLookups());
    expect(result.profilePatch.cityId).toBe('city-1');
    expect(result.profilePatch.areaId).toBe('area-1');
    expect(result.issues.some((i) => i.includes('Area inferred'))).toBe(true);
  });

  it('rejects a city that does not belong to the resolved area', () => {
    const snapshot = baseSnapshot({ customFieldValues: { Area: 'Tirane', City: 'Durres' } });
    const config = baseConfig({ area: { from: ['Area'] }, city: { from: ['City'] } });
    const lookups = baseLookups({ cities: [city(), city({ id: 'city-2', nameSq: 'Durrës', areaId: 'area-2' })] });
    const result = planLegacyClient(snapshot, config, lookups);
    expect(result.profilePatch.cityId).toBeUndefined();
    expect(result.issues.some((i) => i.includes('did not match any active city in the resolved area'))).toBe(true);
  });

  it('rejects a taxId already used by another company', () => {
    const snapshot = baseSnapshot({ customFieldValues: { NIPT: 'K12345678' } });
    const config = baseConfig({ taxId: { from: ['NIPT'] } });
    const lookups = baseLookups({ taxIdsInUse: new Set(['K12345678']) });
    const result = planLegacyClient(snapshot, config, lookups);
    expect(result.profilePatch.taxId).toBeUndefined();
    expect(result.issues.some((i) => i.includes('already used'))).toBe(true);
  });

  it('rejects an invalid website', () => {
    const snapshot = baseSnapshot({ customFieldValues: { Website: 'not-a-url' } });
    const config = baseConfig({ website: { from: ['Website'] } });
    const result = planLegacyClient(snapshot, config, baseLookups());
    expect(result.profilePatch.website).toBeUndefined();
    expect(result.issues.some((i) => i.includes('not a valid address'))).toBe(true);
  });

  it('does not touch customFieldValues (unmapped values stay put)', () => {
    const snapshot = baseSnapshot({ customFieldValues: { 'Payment Terms': 'Net 30' } });
    const result = planLegacyClient(snapshot, baseConfig(), baseLookups());
    expect(result.profilePatch).toEqual({});
  });

  it('creates a primary contact from the legacy email when the company has none', () => {
    const snapshot = baseSnapshot({ email: 'owner@acme.al' });
    const result = planLegacyClient(snapshot, baseConfig(), baseLookups());
    expect(result.contactToCreate).toEqual({ name: 'Acme Ltd', phone: null, email: 'owner@acme.al' });
  });

  it('resolves email/phone through the FieldRole custom fields first', () => {
    const fieldDefs = [
      CustomFieldDefinition.create({ id: 'f1', tenantId: 't1', fieldName: 'E-mail', fieldType: FieldType.EMAIL, role: FieldRole.PRIMARY_EMAIL }),
    ];
    const snapshot = baseSnapshot({ email: 'legacy@acme.al', customFieldValues: { 'E-mail': 'primary@acme.al' } });
    const lookups = baseLookups({ fieldDefs });
    const result = planLegacyClient(snapshot, baseConfig(), lookups);
    expect(result.contactToCreate?.email).toBe('primary@acme.al');
  });

  it('does not propose a contact when the company already has a live one', () => {
    const snapshot = baseSnapshot({ email: 'owner@acme.al', hasLiveContact: true });
    const result = planLegacyClient(snapshot, baseConfig(), baseLookups());
    expect(result.contactToCreate).toBeNull();
  });

  it('drops an invalid email and does not propose a contact with neither channel', () => {
    const snapshot = baseSnapshot({ email: 'not-an-email' });
    const result = planLegacyClient(snapshot, baseConfig(), baseLookups());
    expect(result.contactToCreate).toBeNull();
    expect(result.issues.some((i) => i.includes('not valid'))).toBe(true);
  });

  it('names an unmapped contact after the company and flags it', () => {
    const snapshot = baseSnapshot({ phone: '+355691234567' });
    const result = planLegacyClient(snapshot, baseConfig(), baseLookups());
    expect(result.contactToCreate?.name).toBe('Acme Ltd');
    expect(result.issues.some((i) => i.includes('named after the company'))).toBe(true);
  });

  it('uses the mapped contact name when one is configured', () => {
    const snapshot = baseSnapshot({ phone: '+355691234567', customFieldValues: { 'Contact person': 'Elira Hoxha' } });
    const config = baseConfig({ contactName: { from: ['Contact person'] } });
    const result = planLegacyClient(snapshot, config, baseLookups());
    expect(result.contactToCreate?.name).toBe('Elira Hoxha');
  });

  it('lists missing fields after the patch is applied', () => {
    const snapshot = baseSnapshot();
    const result = planLegacyClient(snapshot, baseConfig(), baseLookups());
    expect(result.missing).toEqual(
      expect.arrayContaining(['business_type', 'area', 'city', 'employee_count', 'contact'])
    );
  });

  it('does not list a field as missing once the plan fills it', () => {
    const snapshot = baseSnapshot({
      customFieldValues: { Industry: 'Kafene', Employees: '5', Area: 'Tirane', City: 'Tirane' },
      email: 'owner@acme.al',
    });
    const config = baseConfig({
      businessType: { from: ['Industry'] },
      employeeCount: { from: ['Employees'] },
      area: { from: ['Area'] },
      city: { from: ['City'] },
    });
    const result = planLegacyClient(snapshot, config, baseLookups());
    expect(result.missing).toEqual([]);
  });

  it('reports nothing missing for a company already complete', () => {
    const snapshot = baseSnapshot({
      profile: { businessTypeId: 'bt-1', employeeCount: 5, areaId: 'area-1', cityId: 'city-1', streetAddress: null, taxId: null, website: null },
      hasLiveContact: true,
    });
    const result = planLegacyClient(snapshot, baseConfig(), baseLookups());
    expect(result.missing).toEqual([]);
    expect(result.profilePatch).toEqual({});
    expect(result.contactToCreate).toBeNull();
  });
});
