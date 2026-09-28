import { DomainError } from '../../shared/domain/errors/DomainError';

/** No value with that id in this list and workspace. Mapped to 404. */
export class LookupItemNotFoundError extends DomainError {
  readonly code = 'LOOKUP_ITEM_NOT_FOUND';

  constructor() {
    super('Value not found.');
  }
}

/** A field failed a list rule (blank name, level below 1). Mapped to 400. */
export class InvalidLookupValueError extends DomainError {
  readonly code = 'INVALID_LOOKUP_VALUE';

  constructor(
    readonly field: string,
    message: string
  ) {
    super(message);
  }
}

/** Another value in the list already has this name or level. Mapped to 409. */
export class LookupValueTakenError extends DomainError {
  readonly code = 'LOOKUP_VALUE_TAKEN';

  constructor(readonly field: string) {
    super('Another value in this list already uses this.');
  }
}

/**
 * A business type must point at an active risk level of the same workspace
 * (FR-SET-01). Mapped to 400.
 */
export class InactiveRiskLevelError extends DomainError {
  readonly code = 'RISK_LEVEL_INACTIVE';
  readonly field = 'riskLevelId';

  constructor() {
    super('Choose an active risk level.');
  }
}

/**
 * The value is used by other records, so it can only be deactivated, never
 * deleted (FR-SET-01, 02). Mapped to 409.
 */
export class LookupItemInUseError extends DomainError {
  readonly code = 'LOOKUP_ITEM_IN_USE';

  constructor(readonly usages: number) {
    super('This value is in use. Deactivate it instead.');
  }
}

/**
 * A risk level that active business types still point at cannot be
 * deactivated: those types would offer a risk level nobody may choose.
 * Mapped to 409.
 */
export class RiskLevelStillUsedError extends DomainError {
  readonly code = 'RISK_LEVEL_STILL_USED';

  constructor(readonly activeBusinessTypes: number) {
    super('Active business types still use this risk level. Move or deactivate them first.');
  }
}

/** A reorder must list every value of the list exactly once. Mapped to 400. */
export class InvalidLookupOrderError extends DomainError {
  readonly code = 'INVALID_LOOKUP_ORDER';

  constructor() {
    super('The new order must list every value exactly once.');
  }
}
