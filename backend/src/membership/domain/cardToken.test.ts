import { generateShareToken } from '../../quotations/domain/shareToken';
import { cardPath, hashCardToken, isWellFormedCardToken, scrubCardTokens, verificationPath } from './cardToken';

describe('card token (M4 Slice 11)', () => {
  it('NFR-SEC-07 a generated token is 256 bits, well formed and different every time', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateShareToken()));
    expect(tokens.size).toBe(50);
    for (const token of tokens) {
      expect(isWellFormedCardToken(token)).toBe(true);
      expect(Buffer.from(token, 'base64url').length * 8).toBeGreaterThanOrEqual(128);
    }
  });

  it.each(['', 'abc', 'x'.repeat(42), 'x'.repeat(44), `${'a'.repeat(42)}!`, `${'a'.repeat(42)} `, null, undefined, 42])(
    'FR-CRD-08 %p is not a card token',
    (value) => {
      expect(isWellFormedCardToken(value)).toBe(false);
    }
  );

  it('D11 a replaced token is kept only as a SHA-256 hash', () => {
    const token = generateShareToken();
    const hash = hashCardToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(hashCardToken(token)).toBe(hash);
    expect(hashCardToken(generateShareToken())).not.toBe(hash);
  });

  it('FR-CRD-02 the card and the QR paths hold the token', () => {
    expect(cardPath('abc')).toBe('/m/abc');
    expect(verificationPath('abc')).toBe('/v/abc');
  });

  it('FR-AUD-16 a token is removed from text that is about to be logged', () => {
    const token = generateShareToken();
    const scrubbed = scrubCardTokens(`Invalid invocation: where: { cardToken: "${token}" } at /public/cards/${token}`);
    expect(scrubbed).not.toContain(token);
    expect(scrubbed).toContain('[card-token]');
  });
});
