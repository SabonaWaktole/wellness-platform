import { DomainError } from '../../shared/domain/errors/DomainError';
import { normalisePercent } from './MembershipSettings';
import { TIERS, type Tier } from './Tier';

export class InvalidBenefitError extends DomainError {
  readonly code = 'INVALID_BENEFIT';

  constructor(
    readonly field: 'nameSq' | 'nameEn' | 'order' | 'discounts',
    message: string
  ) {
    super(message);
  }
}

export class InvalidRelationshipError extends DomainError {
  readonly code = 'INVALID_RELATIONSHIP';

  constructor(
    readonly field: 'nameSq' | 'nameEn' | 'order',
    message: string
  ) {
    super(message);
  }
}

/** Albanian and English names are both required (NFR-I18N-04). */
export function checkNames<E extends DomainError>(
  names: { nameSq: unknown; nameEn: unknown },
  refuse: (field: 'nameSq' | 'nameEn') => E
): { nameSq: string; nameEn: string } {
  const clean = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  const nameSq = clean(names.nameSq);
  const nameEn = clean(names.nameEn);
  if (nameSq.length === 0 || nameSq.length > 191) throw refuse('nameSq');
  if (nameEn.length === 0 || nameEn.length > 191) throw refuse('nameEn');
  return { nameSq, nameEn };
}

export const checkOrder = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 10000 ? value : null;

/** The discounts of one service by tier; null (or a missing tier) is "no discount" (FR-BEN-01). */
export type TierDiscounts = Partial<Record<Tier, string | null>>;

/** Validates the tiers present in a discounts object; a tier left out is not touched. */
export function checkDiscounts(input: unknown): TierDiscounts {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new InvalidBenefitError('discounts', 'Discounts must be given per tier.');
  }
  const out: TierDiscounts = {};
  for (const key of Object.keys(input)) {
    if (!(TIERS as readonly string[]).includes(key)) throw new InvalidBenefitError('discounts', `Unknown tier ${key}.`);
    const value = (input as Record<string, unknown>)[key];
    if (value === undefined) continue;
    if (value === null || value === '') {
      out[key as Tier] = null;
      continue;
    }
    const percent = normalisePercent(value);
    if (percent === null) {
      throw new InvalidBenefitError('discounts', `The ${key} discount must be between 0 and 100 with at most two decimals.`);
    }
    out[key as Tier] = percent;
  }
  return out;
}
