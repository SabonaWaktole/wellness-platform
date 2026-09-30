import { matchLookupLabel, normalizeLabel } from '../../../../src/clients/domain/legacy/matchLabel';
import { LookupItem } from '../../../../src/lookups/domain/LookupItem';

const item = (id: string, nameSq: string, nameEn: string | null = null, active = true): LookupItem => ({
  id,
  nameSq,
  nameEn,
  order: 0,
  active,
});

describe('normalizeLabel (FR-CMP-08)', () => {
  it('trims, lower-cases and strips diacritics', () => {
    expect(normalizeLabel('  Tiranë  ')).toBe('tirane');
    expect(normalizeLabel('Tirane')).toBe(normalizeLabel('Tiranë'));
  });
});

describe('matchLookupLabel (FR-CMP-08)', () => {
  it('matches by Albanian name, diacritic- and case-insensitively', () => {
    const items = [item('1', 'Tiranë'), item('2', 'Durrës')];
    expect(matchLookupLabel('tirane', items)?.id).toBe('1');
  });

  it('matches by English name when the Albanian name differs', () => {
    const items = [item('1', 'Kafene', 'Cafe')];
    expect(matchLookupLabel('Cafe', items)?.id).toBe('1');
  });

  it('ignores inactive values', () => {
    const items = [item('1', 'Tiranë', null, false)];
    expect(matchLookupLabel('Tirane', items)).toBeUndefined();
  });

  it('returns undefined when more than one active value matches', () => {
    const items = [item('1', 'Tirana'), item('2', 'Tirana')];
    expect(matchLookupLabel('Tirana', items)).toBeUndefined();
  });

  it('returns undefined when nothing matches', () => {
    expect(matchLookupLabel('Nowhere', [item('1', 'Tiranë')])).toBeUndefined();
  });
});
