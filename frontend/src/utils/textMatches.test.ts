import { describe, expect, it } from 'vitest';
import { textMatches } from './textMatches';

describe('textMatches', () => {
  it('FR-SCR-08 finds every match, ignoring case', () => {
    expect(textMatches('Çmimi dhe çmimet', 'çmim')).toEqual([
      [0, 4],
      [10, 14],
    ]);
  });

  it('FR-SCR-08 ignores diacritics both ways, so "cmim" finds "çmim" and "pergjigje" finds "përgjigje"', () => {
    expect(textMatches('Pyetje për çmimin', 'cmim')).toEqual([[11, 15]]);
    expect(textMatches('Jepni përgjigje', 'pergjigje')).toEqual([[6, 15]]);
    expect(textMatches('Pyetje per cmimin', 'çmim')).toEqual([[11, 15]]);
  });

  it('returns no matches for an empty or blank query', () => {
    expect(textMatches('Hapja', '')).toEqual([]);
    expect(textMatches('Hapja', '   ')).toEqual([]);
  });

  it('does not overlap matches', () => {
    expect(textMatches('aaaa', 'aa')).toEqual([
      [0, 2],
      [2, 4],
    ]);
  });
});
