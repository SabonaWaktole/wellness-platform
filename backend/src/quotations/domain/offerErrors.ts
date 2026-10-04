import { DomainError } from '../../shared/domain/errors/DomainError';

/**
 * The offer cannot be changed: it is no longer a draft, or its deal is
 * closed. Prices come only from the pricing screen of an open deal
 * (FR-OFR-03); Slice 9 adds revising a sent offer. Mapped to 409.
 */
export class OfferNotEditableError extends DomainError {
  readonly code = 'OFFER_NOT_EDITABLE';

  constructor(message: string) {
    super(message);
  }
}

/**
 * The workspace runs the sales process (D6): an offer is made from a deal's
 * pricing screen (FR-OFR-01), so the legacy quotation create is refused.
 * Mapped to 409.
 */
export class UseDealOffersError extends DomainError {
  readonly code = 'USE_DEAL_OFFERS';

  constructor() {
    super('Offers are made from a deal\'s pricing screen.');
  }
}

/**
 * The offer's status does not allow this step (FR-OFR-09): only a draft
 * becomes Ready, only a Ready offer is marked as sent, only a sent one is
 * accepted, rejected, expired or revised. Mapped to 409.
 */
export class OfferTransitionError extends DomainError {
  readonly code = 'OFFER_INVALID_TRANSITION';

  constructor(
    readonly from: string,
    readonly to: string
  ) {
    super(`An offer that is ${from} cannot become ${to}.`);
  }
}

/** Why a draft cannot become Ready (FR-OFR-09). */
export type OfferNotReadyReason = 'NO_PRICE' | 'DISCOUNT_ABOVE_CAP' | 'MANUAL_PRICE_NOT_APPROVED';

/**
 * The draft is not ready to be a final document: it has no price ("Price on
 * request", FR-PRC-07), its manual price is not approved yet (FR-PRC-09), or
 * its discount is above the cap without an approval covering it (FR-DSC-04,
 * 08). Mapped to 409.
 */
export class OfferNotReadyError extends DomainError {
  readonly code = 'OFFER_NOT_READY';

  constructor(readonly reason: OfferNotReadyReason) {
    super(
      reason === 'NO_PRICE'
        ? 'An offer without a price cannot be made ready.'
        : reason === 'MANUAL_PRICE_NOT_APPROVED'
          ? 'An offer with a manual price cannot be made ready until the price is approved.'
          : 'An offer with a discount above the cap cannot be made ready without approval.'
    );
  }
}

/**
 * The deal's latest offer has been sent: it is changed through a new version
 * (FR-OFR-11), so the pricing screen does not overwrite it. Mapped to 409.
 */
export class OfferReviseFirstError extends DomainError {
  readonly code = 'OFFER_REVISE_FIRST';

  constructor() {
    super('This offer has been sent. Revise it to make a new version.');
  }
}

/**
 * A later version replaces this one: it stays readable and downloadable, but
 * cannot be accepted, rejected, revised or expired (FR-OFR-11). Mapped to 409.
 */
export class OfferNotLatestError extends DomainError {
  readonly code = 'OFFER_NOT_LATEST';

  constructor() {
    super('A later version of this offer replaces it.');
  }
}

/**
 * No such offer in the workspace, or its deal is outside the viewer's scope:
 * "not found", never "forbidden", so a link to someone else's offer does not
 * confirm it exists. Mapped to 404.
 */
export class OfferNotFoundError extends DomainError {
  readonly code = 'OFFER_NOT_FOUND';

  constructor() {
    super('Offer not found.');
  }
}

/** The date sent is in the future, or before the offer existed (FR-OFR-10). Mapped to 400. */
export class InvalidSentDateError extends DomainError {
  readonly code = 'INVALID_SENT_DATE';
  readonly field = 'sentDate';

  constructor(message: string) {
    super(message);
  }
}
