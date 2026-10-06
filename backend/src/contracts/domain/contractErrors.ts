import { DomainError } from '../../shared/domain/errors/DomainError';

/** A request the contract rules refuse, with the field it concerns. Mapped to 400. */
export class ContractValidationError extends DomainError {
  constructor(
    readonly field: string,
    message: string
  ) {
    super(message);
  }
}

/** The contract cannot be made because one already exists for the deal. Mapped to 409 (NFR-DAT-01). */
export class ContractAlreadyExistsError extends DomainError {
  readonly code = 'CONTRACT_EXISTS';

  constructor(readonly contractId: string | null = null) {
    super('This deal already has a contract.');
  }
}

/** A renewal deal cannot be started from this contract, with the reason as a code the screen can read. Mapped to 409 (M3 FR-REN-06). */
export class RenewalNotAllowedError extends DomainError {
  constructor(
    readonly code: 'NOT_RENEWABLE_STATUS' | 'ALREADY_RENEWED' | 'NOT_RENEWING' | 'RENEWAL_OPEN',
    message: string,
    readonly dealId: string | null = null
  ) {
    super(message);
  }
}
