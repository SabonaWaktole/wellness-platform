import type { MemberLanguage } from '../domain/Member';
import type { Tier } from '../domain/Tier';

export interface PublicCardBenefit {
  nameSq: string;
  nameEn: string;
  percent: string;
}

export interface PublicCardInput {
  firstName: string;
  lastName: string;
  memberNumber: string;
  language: MemberLanguage;
  valid: boolean;
  tier: { tier: Tier; labelSq: string; labelEn: string; colour: string };
  /** YYYY-MM-DD, or null when the tier has no expiry (Bronze). */
  validUntil: string | null;
  benefits: PublicCardBenefit[];
  qrSvg: string;
  /** Wall-clock time of this answer, so a cached copy can say how old it is (FR-CRD-06). */
  generatedAt: Date;
}

/** The only fields the card page ever receives (FR-CRD-01). */
export interface PublicCard {
  valid: boolean;
  name: string;
  memberNumber: string;
  language: MemberLanguage;
  tier: { tier: Tier; labelSq: string; labelEn: string; colour: string } | null;
  validUntil: string | null;
  benefits: PublicCardBenefit[];
  qrSvg: string | null;
  generatedAt: string;
}

/**
 * FR-CRD-01 / FR-CRD-03 / FR-BEN-03: an allow-list presenter. Every key is
 * written out here, so a field added to the member later cannot reach the
 * public page by accident: no phone, email, date of birth, employer, payment,
 * status history or note. A member who is not valid gets the name and number
 * only, with no tier, no QR and no discounts.
 */
export function presentPublicCard(input: PublicCardInput): PublicCard {
  const base = {
    name: `${input.firstName} ${input.lastName}`.trim(),
    memberNumber: input.memberNumber,
    language: input.language,
    generatedAt: input.generatedAt.toISOString(),
  };
  if (!input.valid) {
    return { valid: false, ...base, tier: null, validUntil: null, benefits: [], qrSvg: null };
  }
  return {
    valid: true,
    ...base,
    tier: { tier: input.tier.tier, labelSq: input.tier.labelSq, labelEn: input.tier.labelEn, colour: input.tier.colour },
    validUntil: input.validUntil,
    benefits: input.benefits.map((b) => ({ nameSq: b.nameSq, nameEn: b.nameEn, percent: b.percent })),
    qrSvg: input.qrSvg,
  };
}
