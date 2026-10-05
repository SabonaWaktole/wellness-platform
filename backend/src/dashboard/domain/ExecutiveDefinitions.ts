import { Money } from '../../pricing/domain/Money';
import { DayRange } from './PerformancePeriod';

/**
 * The Administrator and CEO dashboard figures of SRS §5.3 and FR-DSH-11 that are decisions rather than
 * database reads, as pure functions so each is tested on a fixed set of data (NFR-ACC-04).
 */

/** The most names an attention item lists; the count is always the full number. */
export const ATTENTION_SAMPLE = 10;

export type AttentionKey = 'CITY_NO_ZONE' | 'ROLE_NO_USERS';

export interface AttentionItem {
  key: AttentionKey;
  count: number;
  /** The first few, so the Administrator can see what to fix. */
  examples: Array<{ id: string; name: string }>;
}

/**
 * What needs the Administrator's attention (FR-DSH-11): active cities that no active price zone covers (an
 * offer there has no zone surcharge to apply) and roles nobody holds. A kind with nothing to report is not
 * an item, so an empty list means all is well. A contract setting left unchanged is never an item.
 */
export function attentionItems(input: {
  citiesInNoZone: ReadonlyArray<{ id: string; name: string }>;
  rolesWithoutUsers: ReadonlyArray<{ id: string; name: string }>;
}): AttentionItem[] {
  const of = (key: AttentionKey, rows: ReadonlyArray<{ id: string; name: string }>): AttentionItem[] =>
    rows.length === 0 ? [] : [{ key, count: rows.length, examples: rows.slice(0, ATTENTION_SAMPLE).map(({ id, name }) => ({ id, name })) }];
  return [...of('CITY_NO_ZONE', input.citiesInNoZone), ...of('ROLE_NO_USERS', input.rolesWithoutUsers)];
}

/** An audit entry reduced to what finding the last change of one setting needs. */
export interface ChangeRecord {
  at: Date;
  fields: readonly string[];
}

/**
 * The latest time one setting changed, from its audit entries (FR-DSH-11). When `field` is given only an
 * entry that changed that field counts, so the discount cap's date does not move when the offer prefix
 * does. `null` when it has never changed since the audit log began.
 */
export function lastChange(entries: readonly ChangeRecord[], field?: string): Date | null {
  const matching = entries.filter((entry) => !field || entry.fields.includes(field));
  if (matching.length === 0) return null;
  return matching.reduce((latest, entry) => (entry.at.getTime() > latest.getTime() ? entry.at : latest), matching[0].at);
}

/** A deal won on a calendar day, with its agreed annual value. */
export interface WonOnDay {
  /** The won date; only its calendar day counts. */
  at: Date;
  annualValue: Money | null;
}

export interface SalesInRange {
  range: DayRange;
  dealsWon: number;
  /** Zero for a deal with no agreed value: it counts as won and adds nothing. */
  salesValue: Money;
}

/**
 * Sales performance over time (FR-DSH-12): for each range, the deals won in it and their sales value. Every
 * deal falls in exactly one range, so the series adds up to the whole period, and a deal counts by the day it
 * was won, as the Performance screen counts it.
 */
export function salesByRange(deals: readonly WonOnDay[], ranges: readonly DayRange[]): SalesInRange[] {
  return ranges.map((range) => {
    const inRange = deals.filter((deal) => {
      const day = deal.at.toISOString().slice(0, 10);
      return day >= range.from && day <= range.to;
    });
    return {
      range,
      dealsWon: inRange.length,
      salesValue: inRange.reduce((sum, deal) => (deal.annualValue ? sum.add(deal.annualValue) : sum), Money.zero()),
    };
  });
}
