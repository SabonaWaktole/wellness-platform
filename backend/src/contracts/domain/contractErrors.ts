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
