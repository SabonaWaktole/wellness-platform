import { describe, expect, it } from 'vitest';
import { tokenFromScan } from './scanToken';

const TOKEN = 'a'.repeat(20) + 'B_-' + '9'.repeat(20);

describe('tokenFromScan (FR-VER-01, FR-CRD-02)', () => {
  it('reads the token from the verification link the QR holds', () => {
    expect(tokenFromScan(`https://cards.wellness.test/v/${TOKEN}`)).toBe(TOKEN);
    expect(tokenFromScan(`  http://localhost:5173/v/${TOKEN}\n`)).toBe(TOKEN);
    expect(tokenFromScan(`https://x.test/v/${TOKEN}?utm=1`)).toBe(TOKEN);
  });

  it('gives null for anything that is not a card link', () => {
    expect(tokenFromScan('WP-000123')).toBeNull();
    expect(tokenFromScan(`https://x.test/m/${TOKEN}`)).toBeNull();
    expect(tokenFromScan('https://x.test/v/short')).toBeNull();
    expect(tokenFromScan(`https://x.test/v/${TOKEN}extra`)).toBeNull();
    expect(tokenFromScan('')).toBeNull();
  });
});
