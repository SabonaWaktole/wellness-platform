import { describe, it, expect } from 'vitest';
import { formatDatePattern, formatDateMediumPattern } from './dateFormatPattern';

/**
 * `dateFormat` used to be surfaced in Settings but consumed nowhere — ordering
 * came from the locale via Intl, so picking a pattern did nothing (TD-012).
 * These tests pin the resolution: the PATTERN owns day/month/year order, and
 * the LOCALE owns everything else.
 */

// 13 Aug 2026, midday UTC — an unambiguous day/month pair, so a swapped
// order is visible rather than looking identical either way round.
const date = new Date('2026-08-13T12:00:00Z');

describe('formatDatePattern', () => {
  it('orders the fields by the pattern, not the locale', () => {
    // Same locale throughout: any difference here is the pattern's doing.
    expect(formatDatePattern(date, 'en-US', 'MM/DD/YYYY', 'UTC')).toBe('08/13/2026');
    expect(formatDatePattern(date, 'en-US', 'DD/MM/YYYY', 'UTC')).toBe('13/08/2026');
    expect(formatDatePattern(date, 'en-US', 'YYYY-MM-DD', 'UTC')).toBe('2026-08-13');
  });

  it('keeps the pattern authoritative even when the locale disagrees', () => {
    // en-GB would natively render 13/08/2026. The workspace asked for
    // month-first, so month-first is what it gets — this is the case the old
    // locale-derived behaviour could not express.
    expect(formatDatePattern(date, 'en-GB', 'MM/DD/YYYY', 'UTC')).toBe('08/13/2026');
  });

  it('resolves the day in the tenant timezone, not the browser one', () => {
    // 22:30Z on the 13th is already the 14th in Tokyo. Getting this wrong is
    // the dashboard-vs-calendar disagreement TD-025 closed.
    const late = new Date('2026-08-13T22:30:00Z');
    expect(formatDatePattern(late, 'en-US', 'DD/MM/YYYY', 'Asia/Tokyo')).toBe('14/08/2026');
    expect(formatDatePattern(late, 'en-US', 'DD/MM/YYYY', 'UTC')).toBe('13/08/2026');
  });

  it('falls back to month-first for an unrecognised pattern', () => {
    // Matches the column default, so a malformed stored value degrades to the
    // documented default instead of rendering something empty.
    expect(formatDatePattern(date, 'en-US', 'nonsense', 'UTC')).toBe('08/13/2026');
  });
});

describe('formatDateMediumPattern', () => {
  it('follows the pattern for day/month order', () => {
    expect(formatDateMediumPattern(date, 'en-US', 'MM/DD/YYYY', 'UTC')).toBe('Aug 13, 2026');
    expect(formatDateMediumPattern(date, 'en-US', 'DD/MM/YYYY', 'UTC')).toBe('13 Aug 2026');
    expect(formatDateMediumPattern(date, 'en-US', 'YYYY-MM-DD', 'UTC')).toBe('2026 Aug 13');
  });

  it('still takes the month NAME from the locale', () => {
    // The pattern governs order only. Language of the month name remains a
    // locale concern, so an Italian workspace reads "ago" not "Aug".
    expect(formatDateMediumPattern(date, 'it-IT', 'DD/MM/YYYY', 'UTC')).toContain('ago');
  });
});
