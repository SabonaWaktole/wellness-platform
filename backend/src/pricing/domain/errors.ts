import { DomainError } from '../../shared/domain/errors/DomainError';

/**
 * What the frontend translates a refused pricing value into. Each is a 400
 * except where noted on its error class.
 */
export type PricingValueErrorCode =
  | 'INVALID_FEE'
  | 'INVALID_PERCENT'
  | 'INVALID_BAND_RANGE'
  | 'INVALID_PRICING_VALUE'
  | 'CITY_NOT_ACTIVE'
  | 'SERVICE_NOT_ACTIVE'
  | 'PACKAGE_NEEDS_SERVICE'
  | 'INVALID_OFFER_SETTING'
  | 'INVALID_RICH_TEXT';

/**
 * A pricing value failed a rule of the model: a fee that is negative, not a
 * number or has three decimals, a percentage outside 0–1000 (FR-PCF-03), an
 * empty band range (FR-PCF-01), a zone city that is not an active city
 * (FR-PCF-05). Mapped to 400.
 */
export class InvalidPricingValueError extends DomainError {
  constructor(
    readonly code: PricingValueErrorCode,
    readonly field: string,
    message: string
  ) {
    super(message);
  }
}

/** Two active bands may not cover the same number of employees (FR-PCF-01). Mapped to 400. */
export class BandsOverlapError extends DomainError {
  readonly code = 'BANDS_OVERLAP';
  readonly field = 'minEmployees';

  constructor(readonly overlapsWith: { minEmployees: number; maxEmployees: number }) {
    super(`This band overlaps the band ${overlapsWith.minEmployees}–${overlapsWith.maxEmployees} employees.`);
  }
}

/** No band, frequency, zone or risk level with that id in this workspace. Mapped to 404. */
export class PricingItemNotFoundError extends DomainError {
  readonly code = 'PRICING_ITEM_NOT_FOUND';

  constructor() {
    super('Value not found.');
  }
}

/** Another frequency or zone already has this name. Mapped to 409. */
export class PricingNameTakenError extends DomainError {
  readonly code = 'PRICING_VALUE_TAKEN';
  readonly field = 'nameSq';

  constructor() {
    super('Another value in this list already uses this name.');
  }
}

/** A reorder must list every value of the list exactly once. Mapped to 400. */
export class InvalidPricingOrderError extends DomainError {
  readonly code = 'INVALID_PRICING_ORDER';

  constructor() {
    super('The new order must list every value exactly once.');
  }
}

export type PricingConflictCode = 'PRICING_ITEM_IN_USE' | 'DEFAULT_PACKAGE_REQUIRED' | 'SERVICE_LAST_IN_PACKAGE';

/**
 * The change would break a rule between lists (FR-PCF-06): a service in a
 * package cannot be deleted, the default package cannot be deactivated or
 * deleted until another is the default, and a package cannot be left without
 * an active service. `names` are the values in the way, for the message.
 * Mapped to 409.
 */
export class PricingConflictError extends DomainError {
  constructor(
    readonly code: PricingConflictCode,
    message: string,
    readonly names: string[] = []
  ) {
    super(message);
  }
}
