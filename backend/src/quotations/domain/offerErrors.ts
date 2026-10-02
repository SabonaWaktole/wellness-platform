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
