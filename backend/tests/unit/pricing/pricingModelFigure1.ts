import { Money } from '../../../src/pricing/domain/Money';
import { Percent } from '../../../src/pricing/domain/Percent';
import { PricingConfig } from '../../../src/pricing/domain/PricingConfig';

/**
 * Wellness Albania's proposed micro-business pricing model (SRS §4.1,
 * Figure 1 / `docs/pricing-model.png`), transcribed by hand, independent of
 * the calculation code it is used to test (NFR-ACC-01).
 *
 * Rows are "employees + 1" as the figure labels them: row 0 = 1 employee,
 * row 9 = 10 employees. The "Wellness Price per Person" column (€100 ÷ n) is
 * not transcribed: it is Wellness Albania's own reference figure, not a
 * value the platform calculates or stores (Q13).
 */
export interface Figure1Row {
  employees: number;
  /** "Proposal Total Price": the base fee B. */
  base: string;
  basePerEmployee: string;
  risk: { low: string; medium: string; high: string };
  frequency: { oneYear: string; twoYear: string; fourYear: string; sixYear: string; monthly: string; adHoc: string };
  zone: { center: string; suburbs: string; kamzaVore: string; elbasanDurres: string };
}

export const figure1Rows: Figure1Row[] = [
  {
    employees: 1,
    base: '30.00',
    basePerEmployee: '30.00',
    risk: { low: '0.00', medium: '3.00', high: '6.00' },
    frequency: { oneYear: '0.00', twoYear: '6.00', fourYear: '10.50', sixYear: '15.00', monthly: '30.00', adHoc: '15.00' },
    zone: { center: '0.00', suburbs: '4.50', kamzaVore: '9.00', elbasanDurres: '30.00' },
  },
  {
    employees: 2,
    base: '38.00',
    basePerEmployee: '19.00',
    risk: { low: '0.00', medium: '3.80', high: '7.60' },
    frequency: { oneYear: '0.00', twoYear: '7.60', fourYear: '13.30', sixYear: '19.00', monthly: '38.00', adHoc: '15.00' },
    zone: { center: '0.00', suburbs: '5.70', kamzaVore: '11.40', elbasanDurres: '38.00' },
  },
  {
    employees: 3,
    base: '46.00',
    basePerEmployee: '15.33',
    risk: { low: '0.00', medium: '4.60', high: '9.20' },
    frequency: { oneYear: '0.00', twoYear: '9.20', fourYear: '16.10', sixYear: '23.00', monthly: '46.00', adHoc: '15.00' },
    zone: { center: '0.00', suburbs: '6.90', kamzaVore: '13.80', elbasanDurres: '46.00' },
  },
  {
    employees: 4,
    base: '54.00',
    basePerEmployee: '13.50',
    risk: { low: '0.00', medium: '5.40', high: '10.80' },
    frequency: { oneYear: '0.00', twoYear: '10.80', fourYear: '18.90', sixYear: '27.00', monthly: '54.00', adHoc: '15.00' },
    zone: { center: '0.00', suburbs: '8.10', kamzaVore: '16.20', elbasanDurres: '54.00' },
  },
  {
    employees: 5,
    base: '62.00',
    basePerEmployee: '12.40',
    risk: { low: '0.00', medium: '6.20', high: '12.40' },
    frequency: { oneYear: '0.00', twoYear: '12.40', fourYear: '21.70', sixYear: '31.00', monthly: '62.00', adHoc: '15.00' },
    zone: { center: '0.00', suburbs: '9.30', kamzaVore: '18.60', elbasanDurres: '62.00' },
  },
  {
    employees: 6,
    base: '70.00',
    basePerEmployee: '11.67',
    risk: { low: '0.00', medium: '7.00', high: '14.00' },
    frequency: { oneYear: '0.00', twoYear: '14.00', fourYear: '24.50', sixYear: '35.00', monthly: '70.00', adHoc: '15.00' },
    zone: { center: '0.00', suburbs: '10.50', kamzaVore: '21.00', elbasanDurres: '70.00' },
  },
  {
    employees: 7,
    base: '78.00',
    basePerEmployee: '11.14',
    risk: { low: '0.00', medium: '7.80', high: '15.60' },
    frequency: { oneYear: '0.00', twoYear: '15.60', fourYear: '27.30', sixYear: '39.00', monthly: '78.00', adHoc: '15.00' },
    zone: { center: '0.00', suburbs: '11.70', kamzaVore: '23.40', elbasanDurres: '78.00' },
  },
  {
    employees: 8,
    base: '86.00',
    basePerEmployee: '10.75',
    risk: { low: '0.00', medium: '8.60', high: '17.20' },
    frequency: { oneYear: '0.00', twoYear: '17.20', fourYear: '30.10', sixYear: '43.00', monthly: '86.00', adHoc: '15.00' },
    zone: { center: '0.00', suburbs: '12.90', kamzaVore: '25.80', elbasanDurres: '86.00' },
  },
  {
    employees: 9,
    base: '94.00',
    basePerEmployee: '10.44',
    risk: { low: '0.00', medium: '9.40', high: '18.80' },
    frequency: { oneYear: '0.00', twoYear: '18.80', fourYear: '32.90', sixYear: '47.00', monthly: '94.00', adHoc: '15.00' },
    zone: { center: '0.00', suburbs: '14.10', kamzaVore: '28.20', elbasanDurres: '94.00' },
  },
  {
    employees: 10,
    base: '102.00',
    basePerEmployee: '10.20',
    risk: { low: '0.00', medium: '10.20', high: '20.40' },
    frequency: { oneYear: '0.00', twoYear: '20.40', fourYear: '35.70', sixYear: '51.00', monthly: '102.00', adHoc: '15.00' },
    zone: { center: '0.00', suburbs: '15.30', kamzaVore: '30.60', elbasanDurres: '102.00' },
  },
];

export const RISK_LOW = 'risk-low';
export const RISK_MEDIUM = 'risk-medium';
export const RISK_HIGH = 'risk-high';

export const FREQ_ONE_YEAR = 'freq-1-year';
export const FREQ_TWO_YEAR = 'freq-2-year';
export const FREQ_FOUR_YEAR = 'freq-4-year';
export const FREQ_SIX_YEAR = 'freq-6-year';
export const FREQ_MONTHLY = 'freq-monthly';
export const FREQ_AD_HOC = 'freq-ad-hoc';

export const ZONE_CENTER = 'zone-tirana-center';
export const ZONE_SUBURBS = 'zone-tirana-suburbs';
export const ZONE_KAMZA_VORE = 'zone-kamza-vore';
export const ZONE_ELBASAN_DURRES = 'zone-elbasan-durres';

/** The Figure 1 pricing model as a `PricingConfig`, for the calculator tests. */
export const figure1Config: PricingConfig = {
  bands: [{ min: 1, max: 10, baseFee: Money.of('30.00'), perEmployeeFee: Money.of('8.00') }],
  riskSurcharges: {
    [RISK_LOW]: Percent.of(0),
    [RISK_MEDIUM]: Percent.of(10),
    [RISK_HIGH]: Percent.of(20),
  },
  frequencies: {
    [FREQ_ONE_YEAR]: { type: 'PERCENT', value: Percent.of(0) },
    [FREQ_TWO_YEAR]: { type: 'PERCENT', value: Percent.of(20) },
    [FREQ_FOUR_YEAR]: { type: 'PERCENT', value: Percent.of(35) },
    [FREQ_SIX_YEAR]: { type: 'PERCENT', value: Percent.of(50) },
    [FREQ_MONTHLY]: { type: 'PERCENT', value: Percent.of(100) },
    [FREQ_AD_HOC]: { type: 'FIXED', amount: Money.of('15.00') },
  },
  zones: {
    [ZONE_CENTER]: Percent.of(0),
    [ZONE_SUBURBS]: Percent.of(15),
    [ZONE_KAMZA_VORE]: Percent.of(30),
    [ZONE_ELBASAN_DURRES]: Percent.of(100),
  },
  discountCap: Percent.of(10),
  contractMonths: 12,
};
