import { hashAddress } from './verification';

describe('hashAddress (FR-VER-10)', () => {
  it('is stable for one address and secret, and differs by address and by secret', () => {
    expect(hashAddress('203.0.113.7', 's1')).toBe(hashAddress('203.0.113.7', 's1'));
    expect(hashAddress('203.0.113.7', 's1')).not.toBe(hashAddress('203.0.113.8', 's1'));
    expect(hashAddress('203.0.113.7', 's1')).not.toBe(hashAddress('203.0.113.7', 's2'));
  });

  it('never contains the address', () => {
    expect(hashAddress('203.0.113.7', 's1')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashAddress('203.0.113.7', 's1')).not.toContain('203');
  });
});
