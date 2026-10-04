import { DomainError } from '../../shared/domain/errors/DomainError';

const DAY_MS = 24 * 60 * 60 * 1000;

export const SALES_SETTINGS_LIMITS = { staleDealDays: { min: 1, max: 365 } } as const;

/** A sales setting is refused. Mapped to 400 with the field. */
export class InvalidSalesSettingsError extends DomainError {
  readonly code = 'INVALID_SALES_SETTINGS';

  constructor(
    readonly field: 'staleDealDays',
    message: string
  ) {
    super(message);
  }
}

/**
 * Workspace sales settings (M2 Slice 11). A workspace with no stored row is
 * on the defaults, as NotificationSettings.
 */
export class SalesSettings {
  private constructor(
    readonly tenantId: string,
    /** FR-DEAL-12: an open deal with no activity for this many days is highlighted. */
    readonly staleDealDays: number
  ) {}

  static defaults(tenantId: string): SalesSettings {
    return new SalesSettings(tenantId, 14);
  }

  static rebuild(props: { tenantId: string; staleDealDays: number }): SalesSettings {
    return new SalesSettings(props.tenantId, props.staleDealDays);
  }

  with(patch: { staleDealDays?: number }): SalesSettings {
    const days = patch.staleDealDays ?? this.staleDealDays;
    const { min, max } = SALES_SETTINGS_LIMITS.staleDealDays;
    if (!Number.isInteger(days) || days < min || days > max) {
      throw new InvalidSalesSettingsError('staleDealDays', `The number of days must be a whole number between ${min} and ${max}.`);
    }
    return new SalesSettings(this.tenantId, days);
  }

  toJSON() {
    return { staleDealDays: this.staleDealDays };
  }
}

/**
 * FR-DEAL-12: what the board and the list highlight on an open deal. Its
 * earliest open follow-up is past due, or it has had no activity for more
 * than the workspace's days. A closed deal is never highlighted.
 */
export function dealMarkers(input: {
  isOpen: boolean;
  nextFollowUpAt: Date | null;
  lastActivityAt: Date;
  staleDealDays: number;
  now: Date;
}): { hasOverdueFollowUp: boolean; isStale: boolean } {
  if (!input.isOpen) return { hasOverdueFollowUp: false, isStale: false };
  return {
    hasOverdueFollowUp: !!input.nextFollowUpAt && input.nextFollowUpAt.getTime() < input.now.getTime(),
    isStale: input.now.getTime() - input.lastActivityAt.getTime() > input.staleDealDays * DAY_MS,
  };
}
