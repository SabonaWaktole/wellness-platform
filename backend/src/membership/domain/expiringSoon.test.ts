import { expiringSoon } from './expiringSoon';
import { day } from './testSupport';

describe('expiringSoon', () => {
  const today = day('2027-06-01');

  it('FR-TIR-10: with a window of 30 days, a term ending in 31 days is Valid', () => {
    expect(expiringSoon(day('2027-07-02'), today, 30)).toBe(false);
  });

  it('FR-TIR-10: with a window of 30 days, a term ending in 30 days is Expiring soon', () => {
    expect(expiringSoon(day('2027-07-01'), today, 30)).toBe(true);
  });

  it('FR-TIR-10: a term ending today is Expiring soon, one that ended yesterday is not', () => {
    expect(expiringSoon(today, today, 30)).toBe(true);
    expect(expiringSoon(day('2027-05-31'), today, 30)).toBe(false);
  });

  it('FR-TIR-10: a term with no end date never expires', () => {
    expect(expiringSoon(null, today, 30)).toBe(false);
  });
});
