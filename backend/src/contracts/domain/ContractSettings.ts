import { DomainError } from '../../shared/domain/errors/DomainError';

export const CONTRACT_SETTINGS_LIMITS = {
  reminderLeadDays: { min: 1, max: 365, maxEntries: 5 },
  expiringSoonDays: { min: 1, max: 365 },
  paymentGraceDays: { min: 0, max: 30 },
  numberPrefix: { pattern: /^[A-Z0-9]{2,6}$/ },
} as const;

export type ContractSettingsField = 'reminderLeadDays' | 'expiringSoonDays' | 'paymentGraceDays' | 'numberPrefix';

/** A contract setting is refused. Mapped to 400 with the field. */
export class InvalidContractSettingsError extends DomainError {
  readonly code = 'INVALID_CONTRACT_SETTINGS';

  constructor(
    readonly field: ContractSettingsField,
    message: string
  ) {
    super(message);
  }
}

export interface ContractSettingsValues {
  reminderLeadDays: number[];
  expiringSoonDays: number;
  paymentGraceDays: number;
  numberPrefix: string;
}

const isWholeNumberIn = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

function checkLeadDays(value: unknown): number[] {
  const { min, max, maxEntries } = CONTRACT_SETTINGS_LIMITS.reminderLeadDays;
  const refuse = (message: string) => new InvalidContractSettingsError('reminderLeadDays', message);
  if (!Array.isArray(value) || value.length === 0) throw refuse('Give at least one reminder lead time.');
  if (value.length > maxEntries) throw refuse(`Give at most ${maxEntries} reminder lead times.`);
  if (!value.every((days) => isWholeNumberIn(days, min, max))) throw refuse(`Each lead time must be a whole number of days between ${min} and ${max}.`);
  if (new Set(value).size !== value.length) throw refuse('Each reminder lead time can appear only once.');
  return [...value].sort((a, b) => b - a);
}

/**
 * Workspace contract settings (M3 Slice 3): the reminder lead times (FR-REN-01),
 * the expiring-soon window (FR-REN-04), the payment grace days (FR-PAY-09) and
 * the contract number prefix (FR-CON-05). A workspace with no stored row is on
 * the defaults, as SalesSettings.
 */
export class ContractSettings {
  private constructor(
    readonly tenantId: string,
    /** Days before the end date, sorted descending. */
    readonly reminderLeadDays: readonly number[],
    readonly expiringSoonDays: number,
    readonly paymentGraceDays: number,
    readonly numberPrefix: string
  ) {}

  static defaults(tenantId: string): ContractSettings {
    return new ContractSettings(tenantId, [60, 30, 7], 30, 0, 'CTR');
  }

  /** Reads a stored row. Rows are written through `with`, so they are valid; the lead times are re-sorted anyway. */
  static rebuild(props: { tenantId: string } & ContractSettingsValues): ContractSettings {
    const lead = Array.isArray(props.reminderLeadDays) ? [...props.reminderLeadDays].sort((a, b) => b - a) : [60, 30, 7];
    return new ContractSettings(props.tenantId, lead, props.expiringSoonDays, props.paymentGraceDays, props.numberPrefix);
  }

  with(patch: Partial<ContractSettingsValues>): ContractSettings {
    const lead = patch.reminderLeadDays === undefined ? this.reminderLeadDays : checkLeadDays(patch.reminderLeadDays);

    const expiring = patch.expiringSoonDays ?? this.expiringSoonDays;
    const expiringLimits = CONTRACT_SETTINGS_LIMITS.expiringSoonDays;
    if (!isWholeNumberIn(expiring, expiringLimits.min, expiringLimits.max)) {
      throw new InvalidContractSettingsError('expiringSoonDays', `The expiring-soon window must be a whole number of days between ${expiringLimits.min} and ${expiringLimits.max}.`);
    }

    const grace = patch.paymentGraceDays ?? this.paymentGraceDays;
    const graceLimits = CONTRACT_SETTINGS_LIMITS.paymentGraceDays;
    if (!isWholeNumberIn(grace, graceLimits.min, graceLimits.max)) {
      throw new InvalidContractSettingsError('paymentGraceDays', `The grace period must be a whole number of days between ${graceLimits.min} and ${graceLimits.max}.`);
    }

    const prefix = patch.numberPrefix ?? this.numberPrefix;
    if (typeof prefix !== 'string' || !CONTRACT_SETTINGS_LIMITS.numberPrefix.pattern.test(prefix)) {
      throw new InvalidContractSettingsError('numberPrefix', 'The prefix must be 2 to 6 uppercase letters or digits.');
    }

    return new ContractSettings(this.tenantId, lead, expiring, grace, prefix);
  }

  toJSON(): ContractSettingsValues {
    return {
      reminderLeadDays: [...this.reminderLeadDays],
      expiringSoonDays: this.expiringSoonDays,
      paymentGraceDays: this.paymentGraceDays,
      numberPrefix: this.numberPrefix,
    };
  }
}
