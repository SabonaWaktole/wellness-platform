import { PricingScreen } from '../../../src/pricing/application/PricingScreen';
import { IPricingStore } from '../../../src/pricing/application/ports/IPricingStore';
import { PricingSubject } from '../../../src/pricing/application/ports/IPricingSubjectReader';
import { LoadPricingConfigUseCase } from '../../../src/pricing/application/use-cases/LoadPricingConfigUseCase';
import { InvalidPricingInputError } from '../../../src/pricing/domain/errors';
import { PricingList } from '../../../src/pricing/domain/PricingLists';
import { ILookupStore } from '../../../src/lookups/application/ports/ILookupStore';
import { LookupList } from '../../../src/lookups/domain/LookupList';
import { figure1Config, FREQ_TWO_YEAR, RISK_HIGH, RISK_MEDIUM, ZONE_CENTER, ZONE_SUBURBS } from './pricingModelFigure1';

const TIRANA = { id: 'city-tirana', nameSq: 'Tiranë', nameEn: 'Tirana' };
const named = (id: string, order = 0, active = true) => ({ id, nameSq: id, nameEn: null, order, active });

const lists: Partial<Record<PricingList, unknown[]>> = {
  [PricingList.Frequencies]: [
    { ...named(FREQ_TWO_YEAR, 2), visitsPerYear: 2, pricingType: 'PERCENT', frequencyValue: '20.00' },
    { ...named('freq-retired', 1, false), visitsPerYear: 3, pricingType: 'PERCENT', frequencyValue: '28.00' },
  ],
  [PricingList.Zones]: [
    { ...named(ZONE_SUBURBS, 2), surchargePercent: '15.00', cityIds: [TIRANA.id] },
    { ...named(ZONE_CENTER, 1), surchargePercent: '0.00', cityIds: [TIRANA.id] },
  ],
  [PricingList.Packages]: [],
  [PricingList.Services]: [],
};

const store = {
  settings: async () => ({ currency: 'EUR', discountCapPercent: '10.00', offerSettings: {} }),
  list: async (_tenantId: string, list: PricingList) => lists[list] ?? [],
} as unknown as IPricingStore;

const lookups = {
  list: async (_tenantId: string, list: LookupList) =>
    list === LookupList.BusinessTypes
      ? [
          { ...named('bt-restaurant'), riskLevelId: RISK_MEDIUM },
          { ...named('bt-old-factory', 9, false), riskLevelId: RISK_HIGH },
        ]
      : [
          { ...named(RISK_MEDIUM), level: 2, description: null },
          { ...named(RISK_HIGH), level: 3, description: null },
        ],
} as unknown as ILookupStore;

const loadConfig = { execute: async () => figure1Config } as unknown as LoadPricingConfigUseCase;
const screen = new PricingScreen(store, lookups, loadConfig);

const subject = (overrides: Partial<PricingSubject> = {}): PricingSubject => ({
  clientId: 'c1',
  companyName: 'Restorant',
  companyAssigneeId: 'u1',
  deal: null,
  employeeCount: 2,
  businessTypeId: 'bt-restaurant',
  city: TIRANA,
  area: TIRANA,
  ...overrides,
});

describe('PricingScreen (M2 Slice 8)', () => {
  it('FR-PRC-01 prices Example A from the company and the choices', async () => {
    const state = await screen.resolve('t1', subject(), { zoneId: ZONE_CENTER, frequencyId: FREQ_TWO_YEAR, discountPercent: '10' });
    expect(state.outcome.kind).toBe('PRICED');
    if (state.outcome.kind !== 'PRICED') return;
    expect(state.outcome.breakdown.listPrice.toString()).toBe('49.40');
    expect(state.outcome.discount.netMonthlyPrice.toString()).toBe('44.46');
    expect(state.outcome.netAnnualValue.toString()).toBe('533.52');
  });

  it('FR-PRC-02 a company with neither a city nor a business type is incomplete, before anything else', async () => {
    const state = await screen.resolve('t1', subject({ city: null, businessTypeId: null }), {});
    expect(state.outcome).toEqual({ kind: 'COMPANY_INCOMPLETE', missing: ['cityId', 'businessTypeId'] });
  });

  it('FR-PRC-05 FR-PRC-06 offers the active frequencies and the city\'s zones, each in their configured order', async () => {
    const state = await screen.resolve('t1', subject(), {});
    expect(state.frequencies.map((f) => f.id)).toEqual([FREQ_TWO_YEAR]);
    expect(state.zones.map((z) => z.id)).toEqual([ZONE_CENTER, ZONE_SUBURBS]);
    expect(state.outcome).toEqual({ kind: 'INPUT_REQUIRED', missing: ['zoneId', 'frequencyId'] });
  });

  it('FR-PRC-07 a city in no zone is "Price on request" even before the other inputs are chosen', async () => {
    const state = await screen.resolve('t1', subject({ city: { id: 'city-kavaje', nameSq: 'Kavajë', nameEn: null } }), {});
    expect(state.outcome).toEqual({ kind: 'PRICE_ON_REQUEST', reason: 'NO_ZONE' });
  });

  it('FR-PRC-03 an inactive business type is refused, unless it is the company\'s own', async () => {
    await expect(screen.resolve('t1', subject(), { businessTypeId: 'bt-old-factory' })).rejects.toThrow(InvalidPricingInputError);
    const own = await screen.resolve('t1', subject({ businessTypeId: 'bt-old-factory' }), {});
    expect(own.riskLevel?.id).toBe(RISK_HIGH);
  });

  it('FR-DSC-04 marks a discount above the cap; the cap itself is within it', async () => {
    const choices = { zoneId: ZONE_CENTER, frequencyId: FREQ_TWO_YEAR };
    expect((await screen.resolve('t1', subject(), { ...choices, discountPercent: '10' })).discountAboveCap).toBe(false);
    expect((await screen.resolve('t1', subject(), { ...choices, discountPercent: '10.01' })).discountAboveCap).toBe(true);
  });
});
