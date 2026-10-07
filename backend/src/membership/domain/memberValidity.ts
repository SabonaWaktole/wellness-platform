import type { Tier } from './Tier';

export type MemberStatus = 'ACTIVE' | 'SUSPENDED' | 'CLOSED';

export interface Validity {
  valid: boolean;
  reason: 'SUSPENDED' | 'CLOSED' | null;
  tier: Tier;
  validUntil: Date | null;
}

/**
 * FR-MEM-06: a member is valid when Active, at least as Bronze. The status is
 * the only reason for not being valid; the tier never is.
 */
export const validityOn = (status: MemberStatus, effectiveTier: Tier, validUntil: Date | null): Validity => ({
  valid: status === 'ACTIVE',
  reason: status === 'ACTIVE' ? null : status,
  tier: effectiveTier,
  validUntil,
});
