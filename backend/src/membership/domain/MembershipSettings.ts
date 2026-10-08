import { DomainError } from '../../shared/domain/errors/DomainError';
import { DEFAULT_MEMBERSHIP_SETTINGS } from './DefaultMembership';

export const MEMBERSHIP_SETTINGS_LIMITS = {
  familyDiscountPercent: { min: 0, max: 100 },
  graceDays: { min: 0, max: 60 },
  expiringSoonDays: { min: 1, max: 365 },
  vipReviewNoticeDays: { min: 1, max: 365 },
  prefix: /^[A-Z0-9]{2,6}$/,
} as const;

export type MembershipSettingsField =
  | 'familyDiscountPercent'
  | 'graceDays'
  | 'expiringSoonDays'
  | 'memberPrefix'
  | 'receiptPrefix'
  | 'vipReviewNoticeDays';

/** A Wellness+ setting is refused. Mapped to 400 with the field. */
export class InvalidMembershipSettingsError extends DomainError {
  readonly code = 'INVALID_MEMBERSHIP_SETTINGS';

  constructor(
    readonly field: MembershipSettingsField,
    message: string
  ) {
    super(message);
  }
}

export interface MembershipSettingsValues {
  /** Two-decimal string, 0.00 to 100.00 (FR-FAM-04). */
  familyDiscountPercent: string;
  graceDays: number;
  expiringSoonDays: number;
  memberPrefix: string;
  receiptPrefix: string;
  vipReviewNoticeDays: number;
}

const wholeIn = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

/** A percentage 0..100 with at most two decimals, as the string the API and database use. */
export function normalisePercent(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(text)) return null;
  const number = Number(text);
  return number >= 0 && number <= 100 ? number.toFixed(2) : null;
}

/** Workspace Wellness+ rules (M4 Slice 3). A workspace with no stored row is on the defaults. */
export class MembershipSettings {
  private constructor(
    readonly tenantId: string,
    private readonly values: MembershipSettingsValues
  ) {}

  static defaults(tenantId: string): MembershipSettings {
    return new MembershipSettings(tenantId, { ...DEFAULT_MEMBERSHIP_SETTINGS });
  }

  /** Reads a stored row; rows are only written through `with`. */
  static rebuild(props: { tenantId: string } & MembershipSettingsValues): MembershipSettings {
    const { tenantId, ...values } = props;
    return new MembershipSettings(tenantId, { ...values, familyDiscountPercent: Number(values.familyDiscountPercent).toFixed(2) });
  }

  with(patch: Partial<MembershipSettingsValues>): MembershipSettings {
    const next = { ...this.values, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) } as MembershipSettingsValues;

    const discount = normalisePercent(next.familyDiscountPercent);
    if (discount === null) {
      throw new InvalidMembershipSettingsError('familyDiscountPercent', 'The family discount must be between 0 and 100, with at most two decimals.');
    }
    const days = (field: 'graceDays' | 'expiringSoonDays' | 'vipReviewNoticeDays', label: string) => {
      const { min, max } = MEMBERSHIP_SETTINGS_LIMITS[field];
      if (!wholeIn(next[field], min, max)) {
        throw new InvalidMembershipSettingsError(field, `${label} must be a whole number of days between ${min} and ${max}.`);
      }
    };
    days('graceDays', 'The grace period');
    days('expiringSoonDays', 'The expiring-soon window');
    days('vipReviewNoticeDays', 'The VIP review notice');
    for (const field of ['memberPrefix', 'receiptPrefix'] as const) {
      if (typeof next[field] !== 'string' || !MEMBERSHIP_SETTINGS_LIMITS.prefix.test(next[field])) {
        throw new InvalidMembershipSettingsError(field, 'The prefix must be 2 to 6 uppercase letters or digits.');
      }
    }
    return new MembershipSettings(this.tenantId, { ...next, familyDiscountPercent: discount });
  }

  get familyDiscountPercent() {
    return this.values.familyDiscountPercent;
  }
  get graceDays() {
    return this.values.graceDays;
  }
  get expiringSoonDays() {
    return this.values.expiringSoonDays;
  }
  get memberPrefix() {
    return this.values.memberPrefix;
  }
  get receiptPrefix() {
    return this.values.receiptPrefix;
  }
  get vipReviewNoticeDays() {
    return this.values.vipReviewNoticeDays;
  }

  toJSON(): MembershipSettingsValues {
    return { ...this.values };
  }
}
