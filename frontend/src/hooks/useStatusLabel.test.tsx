import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import i18n from '../i18n';
import { useStatusLabel } from './useStatusLabel';
import {
  QUOTATION_STATUS_KEYS,
  CLIENT_STATUS_KEYS,
  PRODUCT_STATUS_KEYS,
} from '../constants/statusKeys';

/**
 * Status labels used to come from four separate mechanisms, three of which
 * derived the text from the enum's own spelling:
 *
 *   status.charAt(0).toUpperCase() + status.slice(1)
 *
 * That is not a translation gap that was missed — it is untranslatable by
 * construction, and no catalogue could have fixed it while it remained.
 */
describe('useStatusLabel', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('translates quotation statuses', () => {
    const { result } = renderHook(() => useStatusLabel());

    expect(result.current.quotation('DRAFT')).toBe('Draft');
    // The case the old capitalise-the-enum approach got wrong: it produced
    // "Pending_approval" for anything with an underscore, which is why both
    // copies carried a hand-written special case for exactly this one value.
    expect(result.current.quotation('PENDING_APPROVAL')).toBe('Pending Approval');
    expect(result.current.quotation('EXPIRED')).toBe('Expired');
  });

  it('translates client and product statuses', () => {
    const { result } = renderHook(() => useStatusLabel());

    expect(result.current.client('PROSPECT')).toBe('Prospect');
    expect(result.current.product('OUT_OF_STOCK')).toBe('Out of Stock');
  });

  it('renders Albanian when the interface language is Albanian', async () => {
    await i18n.changeLanguage('sq');
    const { result } = renderHook(() => useStatusLabel());

    expect(result.current.quotation('ACCEPTED')).toBe('Pranuar');
    expect(result.current.product('IN_STOCK')).toBe('Në gjendje');

    await i18n.changeLanguage('en');
  });

  it('falls back to the raw value for a status it does not know', () => {
    // A backend status the frontend has not caught up with should be visibly
    // untranslated rather than blank or silently mapped to the wrong label.
    const { result } = renderHook(() => useStatusLabel());

    expect(result.current.quotation('SOME_NEW_STATUS')).toBe('SOME_NEW_STATUS');
    expect(result.current.client('')).toBe('');
  });

  it('is not fooled by inherited object properties', () => {
    // `keys[status]` without a hasOwnProperty guard would resolve 'constructor'
    // or 'toString' to a function off Object.prototype.
    const { result } = renderHook(() => useStatusLabel());

    expect(result.current.quotation('constructor')).toBe('constructor');
    expect(result.current.product('toString')).toBe('toString');
  });
});

describe('status key maps', () => {
  it('has a catalogue entry for every mapped status, in both languages', () => {
    const allKeys = [
      ...Object.values(QUOTATION_STATUS_KEYS),
      ...Object.values(CLIENT_STATUS_KEYS),
      ...Object.values(PRODUCT_STATUS_KEYS),
    ];

    for (const language of ['en', 'sq'] as const) {
      const t = i18n.getFixedT(language);
      for (const key of allKeys) {
        const translated = t(key);
        // A missing key renders as the key itself, which is the exact failure
        // this asserts against.
        expect(translated, `${language} missing ${key}`).not.toBe(key);
        expect(translated).not.toContain(':');
      }
    }
  });

  it('covers the quotation statuses the backend can actually emit', () => {
    // Mirrors QuotationStatus in backend/src/quotations/domain/Quotation.ts.
    // MARK_ACCEPTED and MARK_REJECTED are deliberately absent: they are action
    // names, never statuses, and the label functions that handled them were
    // carrying dead branches.
    expect(Object.keys(QUOTATION_STATUS_KEYS).sort()).toEqual([
      'ACCEPTED',
      'DRAFT',
      'EXPIRED',
      'PENDING_APPROVAL',
      'READY',
      'REJECTED',
      'SENT',
    ]);
  });
});
