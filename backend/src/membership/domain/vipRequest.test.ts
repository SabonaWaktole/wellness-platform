import { checkVipDecision, checkVipRequest, decisionNote, vipDecision, vipReason } from './vipRequest';

describe('VIP request rules', () => {
  it('FR-VIP-01 a request needs a reason', () => {
    expect(() => vipReason('  ', 'x')).toThrow();
    expect(() => vipReason(undefined, 'x')).toThrow();
    expect(() => vipReason('a'.repeat(501), 'x')).toThrow();
    expect(vipReason('  strategic client ', 'x')).toBe('strategic client');
  });

  it('FR-VIP-01 a closed member or one with an open request is refused', () => {
    expect(checkVipRequest({ memberClosed: true, hasOpenRequest: false })).toBe('MEMBER_CLOSED');
    expect(checkVipRequest({ memberClosed: false, hasOpenRequest: true })).toBe('OPEN_REQUEST');
    expect(checkVipRequest({ memberClosed: false, hasOpenRequest: false })).toBeNull();
  });

  it('FR-VIP-02 a rejection needs a reason, an approval does not', () => {
    expect(() => decisionNote('REJECT', '')).toThrow();
    expect(decisionNote('REJECT', ' no ')).toBe('no');
    expect(decisionNote('APPROVE', undefined)).toBeNull();
    expect(() => vipDecision('MAYBE')).toThrow();
  });

  it('FR-VIP-02 nobody decides their own request, and only a pending request is decided', () => {
    const base = { status: 'PENDING', requestedBy: 'a', deciderId: 'b', memberClosed: false, decision: 'APPROVE' } as const;
    expect(checkVipDecision(base)).toBeNull();
    expect(checkVipDecision({ ...base, deciderId: 'a' })).toBe('OWN_REQUEST');
    expect(checkVipDecision({ ...base, decision: 'REJECT', deciderId: 'a' })).toBe('OWN_REQUEST');
    expect(checkVipDecision({ ...base, status: 'APPROVED' })).toBe('NOT_PENDING');
    expect(checkVipDecision({ ...base, memberClosed: true })).toBe('MEMBER_CLOSED');
    expect(checkVipDecision({ ...base, memberClosed: true, decision: 'REJECT' })).toBeNull();
  });
});
