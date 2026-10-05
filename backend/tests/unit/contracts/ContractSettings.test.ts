import { ContractSettings, InvalidContractSettingsError } from '../../../src/contracts/domain/ContractSettings';

const defaults = () => ContractSettings.defaults('tenant-1');
const field = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidContractSettingsError);
    return (error as InvalidContractSettingsError).field;
  }
  throw new Error('expected the settings to be refused');
};

describe('ContractSettings (M3 Slice 3)', () => {
  it('a workspace with no saved row is on the SRS defaults (Q6, Q13)', () => {
    expect(defaults().toJSON()).toEqual({ reminderLeadDays: [60, 30, 7], expiringSoonDays: 30, paymentGraceDays: 0, numberPrefix: 'CTR' });
  });

  it('FR-REN-01 stores the lead times sorted descending', () => {
    expect(defaults().with({ reminderLeadDays: [30, 90] }).reminderLeadDays).toEqual([90, 30]);
    expect(defaults().with({ reminderLeadDays: [1, 365, 7, 30, 60] }).reminderLeadDays).toEqual([365, 60, 30, 7, 1]);
  });

  it.each([
    ['empty', []],
    ['duplicates', [30, 30]],
    ['zero', [0, 30]],
    ['above 365', [400, 30]],
    ['six entries', [90, 60, 30, 14, 7, 1]],
    ['a fraction', [30.5]],
    ['not a number', ['30']],
  ])('FR-REN-01 refuses lead times that are %s', (_name, value) => {
    expect(field(() => defaults().with({ reminderLeadDays: value as number[] }))).toBe('reminderLeadDays');
  });

  it('FR-REN-01 refuses a list that is not a list', () => {
    expect(field(() => defaults().with({ reminderLeadDays: 30 as unknown as number[] }))).toBe('reminderLeadDays');
  });

  it.each([
    [1, true],
    [365, true],
    [0, false],
    [366, false],
    [1.5, false],
  ])('FR-REN-04 expiring-soon window %s days is allowed: %s', (days, ok) => {
    if (ok) expect(defaults().with({ expiringSoonDays: days }).expiringSoonDays).toBe(days);
    else expect(field(() => defaults().with({ expiringSoonDays: days }))).toBe('expiringSoonDays');
  });

  it.each([
    [0, true],
    [30, true],
    [-1, false],
    [31, false],
    [2.5, false],
  ])('FR-PAY-09 grace days %s are allowed: %s', (days, ok) => {
    if (ok) expect(defaults().with({ paymentGraceDays: days }).paymentGraceDays).toBe(days);
    else expect(field(() => defaults().with({ paymentGraceDays: days }))).toBe('paymentGraceDays');
  });

  it.each([
    ['CTR', true],
    ['AB', true],
    ['AB12CD', true],
    ['A', false],
    ['ABCDEFG', false],
    ['ctr', false],
    ['CT-R', false],
    ['CT R', false],
    ['', false],
  ])('FR-CON-05 prefix %j is allowed: %s', (prefix, ok) => {
    if (ok) expect(defaults().with({ numberPrefix: prefix }).numberPrefix).toBe(prefix);
    else expect(field(() => defaults().with({ numberPrefix: prefix }))).toBe('numberPrefix');
  });

  it('only the fields sent change', () => {
    const next = defaults().with({ expiringSoonDays: 14 });
    expect(next.toJSON()).toEqual({ reminderLeadDays: [60, 30, 7], expiringSoonDays: 14, paymentGraceDays: 0, numberPrefix: 'CTR' });
  });

  it('rebuild reads a stored lead-time list defensively', () => {
    const row = { tenantId: 't', reminderLeadDays: [7, 60, 30], expiringSoonDays: 30, paymentGraceDays: 0, numberPrefix: 'CTR' };
    expect(ContractSettings.rebuild(row).reminderLeadDays).toEqual([60, 30, 7]);
  });
});
