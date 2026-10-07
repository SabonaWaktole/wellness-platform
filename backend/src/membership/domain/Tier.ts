export const TIERS = ['BRONZE', 'SILVER', 'GOLD', 'VIP'] as const;
export type Tier = (typeof TIERS)[number];

export const tierRank = (tier: Tier): number => TIERS.indexOf(tier);

export const higherTier = (a: Tier, b: Tier): Tier => (tierRank(a) >= tierRank(b) ? a : b);

export type TierChangeTrigger =
  | 'PAYMENT_NEW'
  | 'PAYMENT_UPGRADE'
  | 'TERM_ENDED'
  | 'CONTRACT_INVALID'
  | 'CONTRACT_VALID'
  | 'VIP_APPROVED'
  | 'VIP_ENDED'
  | 'EMPLOYEE_REMOVED';

const ALLOWED: Record<TierChangeTrigger, ReadonlyArray<readonly [Tier, Tier]>> = {
  PAYMENT_NEW: [['BRONZE', 'SILVER'], ['BRONZE', 'GOLD']],
  PAYMENT_UPGRADE: [['SILVER', 'GOLD']],
  TERM_ENDED: [['GOLD', 'SILVER'], ['SILVER', 'BRONZE']],
  CONTRACT_INVALID: [['SILVER', 'BRONZE']],
  CONTRACT_VALID: [['BRONZE', 'SILVER']],
  VIP_APPROVED: [['BRONZE', 'VIP'], ['SILVER', 'VIP'], ['GOLD', 'VIP']],
  VIP_ENDED: [['VIP', 'GOLD'], ['VIP', 'SILVER'], ['VIP', 'BRONZE']],
  EMPLOYEE_REMOVED: [['SILVER', 'BRONZE']],
};

/**
 * The allowed changes of tier, and only these (SRS 3.2). A renewal keeps the
 * tier, so it is not a change and has no row.
 */
export const canChangeTier = (from: Tier, to: Tier, trigger: TierChangeTrigger): boolean =>
  ALLOWED[trigger].some(([f, t]) => f === from && t === to);
