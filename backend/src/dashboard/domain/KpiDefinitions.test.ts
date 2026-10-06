import { Money } from '../../pricing/domain/Money';
import {
  averageTimeToClose,
  conversionRate,
  EMPTY_INDICATORS,
  figuresOf,
  moneyChange,
  onTimeShare,
  periodChange,
  RawIndicators,
  totalRow,
} from './KpiDefinitions';

const row = (over: Partial<RawIndicators>): RawIndicators => ({ ...EMPTY_INDICATORS(), ...over });

describe('NFR-ACC-04: conversion rate (SRS §5.3, §6.2)', () => {
  it.each([
    [4, 6, 40],
    [1, 1, 50],
    [5, 12 - 5, 41.7],
    [1, 0, 100],
    [0, 3, 0],
    [1, 2, 33.3],
    [2, 1, 66.7],
  ])('%i won and %i lost is %s%%', (won, lost, expected) => {
    expect(conversionRate(won, lost)).toBe(expected);
  });

  it('is null, not 0%, when no deal closed', () => {
    expect(conversionRate(0, 0)).toBeNull();
  });
});

describe('NFR-ACC-04: average time to close and on-time share', () => {
  it.each([
    [[10, 20], 15],
    [[1, 2], 1.5],
    [[3], 3],
    [[1, 1, 2], 1.3],
  ])('%j averages to %s days', (days, expected) => {
    expect(averageTimeToClose(days)).toBe(expected);
  });

  it('is null when none was won', () => {
    expect(averageTimeToClose([])).toBeNull();
  });

  it('is the share completed on or before the due date, null when none completed', () => {
    expect(onTimeShare(3, 4)).toBe(75);
    expect(onTimeShare(0, 0)).toBeNull();
  });
});

describe('FR-PRF-04: the total row is calculated from the data, not from the rows', () => {
  const first = row({ dealsWon: 4, dealsLost: 6, closeDays: [10, 10, 10, 10], followUpsCompleted: 2, followUpsOnTime: 2 });
  const second = row({ dealsWon: 1, dealsLost: 1, closeDays: [40], followUpsCompleted: 2, followUpsOnTime: 0 });

  it('40% and 50% make 5 / 12 = 41.7%, not their average of 45%', () => {
    const total = figuresOf(totalRow([first, second], 0));
    expect(total.dealsWon).toBe(5);
    expect(total.dealsLost).toBe(7);
    expect(total.conversionRate).toBe(41.7);
  });

  it('takes the average time to close from the combined deals, not the average of the averages', () => {
    // 10 days and 40 days: the rows' average would be 25; the five deals average 16.
    expect(figuresOf(first).averageTimeToClose).toBe(10);
    expect(figuresOf(second).averageTimeToClose).toBe(40);
    expect(figuresOf(totalRow([first, second], 0)).averageTimeToClose).toBe(16);
  });

  it('takes the on-time share from the combined follow-ups', () => {
    expect(figuresOf(totalRow([first, second], 0)).onTimeShare).toBe(50);
  });

  it('does not add companies contacted, which two salespeople can share', () => {
    const a = row({ companiesContacted: 3 });
    const b = row({ companiesContacted: 2 });
    expect(totalRow([a, b], 4).companiesContacted).toBe(4);
  });

  it('adds the value of the won deals as money (the §5.3 worked example)', () => {
    const a = row({ totalValue: Money.of('592.80').add(Money.of('600.00')) });
    const b = row({ totalValue: Money.of('1200.00').add(Money.of('480.00')) });
    expect(totalRow([a, b], 0).totalValue.toString()).toBe('2872.80');
  });

  it('is empty, with no rate, for no salespeople', () => {
    const total = figuresOf(totalRow([], 0));
    expect(total.conversionRate).toBeNull();
    expect(total.averageTimeToClose).toBeNull();
    expect(total.totalValue.toString()).toBe('0.00');
  });
});

describe('FR-PRF-06: change against the previous period', () => {
  it.each([
    [5, 3, { delta: 2, direction: 'UP' }],
    [3, 5, { delta: -2, direction: 'DOWN' }],
    [4, 4, { delta: 0, direction: 'SAME' }],
    [41.7, 40, { delta: 1.7, direction: 'UP' }],
  ])('%s against %s', (current, previous, expected) => {
    expect(periodChange(current, previous)).toEqual(expected);
  });

  it('has no change when a side has no value', () => {
    expect(periodChange(null, 40)).toBeNull();
    expect(periodChange(40, null)).toBeNull();
  });

  it('subtracts money exactly', () => {
    expect(moneyChange(Money.of('2872.80'), Money.of('0.10'))).toEqual({ delta: '2872.70', direction: 'UP' });
    expect(moneyChange(Money.of('1.00'), Money.of('1.00'))).toEqual({ delta: '0.00', direction: 'SAME' });
  });
});
