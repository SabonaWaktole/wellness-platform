import { DomainError } from '../../shared/domain/errors/DomainError';
import { Money } from '../../pricing/domain/Money';
import type { Tier } from './Tier';

export type TierSettingField = 'labelSq' | 'labelEn' | 'colour' | 'fee' | 'termMonths';

/** A tier setting is refused. Mapped to 400 with the field. */
export class InvalidTierSettingError extends DomainError {
  readonly code = 'INVALID_TIER_SETTING';

  constructor(
    readonly field: TierSettingField,
    message: string
  ) {
    super(message);
  }
}

export interface TierSettingValues {
  labelSq: string;
  labelEn: string;
  /** #RRGGBB */
  colour: string;
  /** Two-decimal string, or null for a free tier. */
  fee: string | null;
  termMonths: number | null;
}

export const TIER_SETTING_LIMITS = { termMonths: { min: 1, max: 60 }, minFee: '0.01', labelMax: 40 } as const;

const PAID_TIERS: readonly Tier[] = ['SILVER', 'GOLD'];

/** One of the four fixed tiers with its label, colour, fee and term (FR-TIR-01). */
export class TierSetting {
  private constructor(
    readonly tier: Tier,
    private readonly values: TierSettingValues
  ) {}

  static rebuild(tier: Tier, values: TierSettingValues): TierSetting {
    return new TierSetting(tier, { ...values, fee: values.fee === null ? null : Number(values.fee).toFixed(2) });
  }

  /**
   * Bronze and VIP are free and cannot be given a fee; Bronze has no term;
   * Silver and Gold need a fee of at least 0.01 and a term of 1 to 60 months;
   * VIP needs a term. A new fee changes later payments only, since a payment
   * stores its own amount (FR-TIR-01).
   */
  with(patch: Partial<TierSettingValues>): TierSetting {
    const next = { ...this.values, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) } as TierSettingValues;

    for (const field of ['labelSq', 'labelEn'] as const) {
      const label = typeof next[field] === 'string' ? next[field].trim() : '';
      if (label.length === 0 || label.length > TIER_SETTING_LIMITS.labelMax) {
        throw new InvalidTierSettingError(field, `The label is required in Albanian and English, up to ${TIER_SETTING_LIMITS.labelMax} characters.`);
      }
      next[field] = label;
    }
    if (typeof next.colour !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(next.colour)) {
      throw new InvalidTierSettingError('colour', 'The colour must be a hex value such as #C9A227.');
    }
    next.colour = next.colour.toUpperCase();

    const paid = PAID_TIERS.includes(this.tier);
    if (!paid && next.fee !== null) {
      throw new InvalidTierSettingError('fee', 'This tier is free and cannot be given a fee.');
    }
    if (paid) {
      const text = typeof next.fee === 'string' || typeof next.fee === 'number' ? String(next.fee) : '';
      if (!/^\d+(\.\d{1,2})?$/.test(text)) {
        throw new InvalidTierSettingError('fee', 'The fee must be an amount with at most two decimals.');
      }
      const fee = Money.of(text);
      if (!fee.isPositive()) {
        throw new InvalidTierSettingError('fee', `The fee must be at least ${TIER_SETTING_LIMITS.minFee}.`);
      }
      next.fee = fee.toString();
    }

    if (this.tier === 'BRONZE') {
      if (next.termMonths !== null) throw new InvalidTierSettingError('termMonths', 'Bronze has no end and no term.');
    } else {
      const { min, max } = TIER_SETTING_LIMITS.termMonths;
      if (typeof next.termMonths !== 'number' || !Number.isInteger(next.termMonths) || next.termMonths < min || next.termMonths > max) {
        throw new InvalidTierSettingError('termMonths', `The term must be a whole number of months between ${min} and ${max}.`);
      }
    }
    return new TierSetting(this.tier, next);
  }

  get labelSq() {
    return this.values.labelSq;
  }
  get labelEn() {
    return this.values.labelEn;
  }
  get colour() {
    return this.values.colour;
  }
  get fee() {
    return this.values.fee;
  }
  get termMonths() {
    return this.values.termMonths;
  }

  toJSON(): TierSettingValues {
    return { ...this.values };
  }
}
