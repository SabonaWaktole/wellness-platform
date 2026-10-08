import type { MemberStatus } from '../domain/memberValidity';
import type { Tier } from '../domain/Tier';

export interface TierLabel {
  tier: Tier;
  labelSq: string;
  labelEn: string;
  colour: string;
}

export interface VerificationDiscount {
  nameSq: string;
  nameEn: string;
  percent: string;
}

export interface ReceptionVerificationInput {
  verificationId: string;
  valid: boolean;
  reason: 'SUSPENDED' | 'CLOSED' | null;
  firstName: string;
  lastName: string;
  memberNumber: string;
  tier: TierLabel;
  validUntil: string | null;
  status: MemberStatus;
  dateOfBirth: string | null;
  discounts: VerificationDiscount[];
}

/** What Reception sees (FR-VER-02). Every key is written out below, so nothing added to the member later can reach this screen. */
export type ReceptionVerification =
  | { found: false; verificationId: string }
  | {
      found: true;
      verificationId: string;
      valid: boolean;
      reason: 'SUSPENDED' | 'CLOSED' | null;
      name: string;
      memberNumber: string;
      tier: TierLabel;
      validUntil: string | null;
      status: MemberStatus;
      dateOfBirth: string | null;
      discounts: VerificationDiscount[];
    };

export const presentVerificationNotFound = (verificationId: string): ReceptionVerification => ({ found: false, verificationId });

/**
 * FR-VER-02, FR-VER-05: the exact shape for Reception: Valid or Not valid with
 * the reason, name, member ID, tier, valid-until, status, date of birth and the
 * discounts of the effective tier. A member who is not valid gets no discounts.
 * No payment, fee, phone, email, employer or note.
 */
export function presentMemberForVerification(input: ReceptionVerificationInput): ReceptionVerification {
  return {
    found: true,
    verificationId: input.verificationId,
    valid: input.valid,
    reason: input.valid ? null : input.reason,
    name: `${input.firstName} ${input.lastName}`.trim(),
    memberNumber: input.memberNumber,
    tier: { tier: input.tier.tier, labelSq: input.tier.labelSq, labelEn: input.tier.labelEn, colour: input.tier.colour },
    validUntil: input.validUntil,
    status: input.status,
    dateOfBirth: input.dateOfBirth,
    discounts: input.valid ? input.discounts.map((d) => ({ nameSq: d.nameSq, nameEn: d.nameEn, percent: d.percent })) : [],
  };
}

/** What a partner clinic sees (FR-VER-07, FR-VER-09): one neutral "Not valid" for every reason, including an unknown card. */
export type PublicVerification =
  | { valid: false }
  | { valid: true; name: string; memberNumber: string; tier: TierLabel; validUntil: string | null };

export const presentNotValidForPublic = (): PublicVerification => ({ valid: false });

export function presentMemberForPublicVerification(input: { firstName: string; lastName: string; memberNumber: string; tier: TierLabel; validUntil: string | null }): PublicVerification {
  return {
    valid: true,
    name: `${input.firstName} ${input.lastName}`.trim(),
    memberNumber: input.memberNumber,
    tier: { tier: input.tier.tier, labelSq: input.tier.labelSq, labelEn: input.tier.labelEn, colour: input.tier.colour },
    validUntil: input.validUntil,
  };
}

/** A search hit: enough to choose a person, nothing that is not already on the verification screen (FR-VER-01). */
export interface VerificationCandidate {
  id: string;
  name: string;
  memberNumber: string;
}

/** One row of the verification log on the member page (FR-VER-06). */
export interface VerificationLogEntry {
  id: string;
  channel: 'RECEPTION_SCAN' | 'RECEPTION_SEARCH' | 'PARTNER_SCAN';
  result: 'VALID' | 'NOT_VALID' | 'NOT_FOUND';
  identityChoice: 'NONE' | 'CONFIRMED' | 'MISMATCH';
  by: string | null;
  at: Date;
}
