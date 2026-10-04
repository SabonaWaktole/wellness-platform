import { DomainError } from '../../shared/domain/errors/DomainError';

/**
 * No such deal in this workspace, a deleted one, or one outside the caller's
 * scope (FR-DEAL-04: "not found", never "forbidden", so a link does not
 * confirm the deal exists). Mapped to 404.
 */
export class DealNotFoundError extends DomainError {
  readonly code = 'DEAL_NOT_FOUND';

  constructor() {
    super('Deal not found.');
  }
}

export type InvalidDealField =
  | 'type'
  | 'title'
  | 'notes'
  | 'expectedCloseDate'
  | 'clientId'
  | 'ownerUserId'
  | 'stage'
  | 'cursor'
  | 'lostReasonId'
  | 'lostNote'
  | 'comment'
  | 'closingDate';

/** A deal field is refused. Mapped to 400 with the field, so the form can show it. */
export class InvalidDealError extends DomainError {
  readonly code = 'INVALID_DEAL';

  constructor(
    readonly field: InvalidDealField,
    message: string
  ) {
    super(message);
  }
}

/**
 * The stage move is not allowed (FR-DEAL-07): Won and Lost have their own
 * actions, and a closed deal is reopened, not moved. Mapped to 409.
 */
export class DealStageNotAllowedError extends DomainError {
  readonly code = 'DEAL_STAGE_NOT_ALLOWED';

  constructor(message: string) {
    super(message);
  }
}

/**
 * A deal with an offer marked as sent is a record of what the company was
 * offered, so it is kept (FR-DEAL-19). Mapped to 409.
 */
export class DealHasSentOfferError extends DomainError {
  readonly code = 'DEAL_HAS_SENT_OFFER';

  constructor() {
    super('A deal with an offer marked as sent cannot be deleted.');
  }
}

/** The offer cannot win this deal (FR-DEAL-14). Mapped to 409. */
export class DealNotWinnableError extends DomainError {
  readonly code = 'DEAL_NOT_WINNABLE';

  constructor(message: string) {
    super(message);
  }
}
