import { DomainError } from '../../shared/domain/errors/DomainError';

export class SelfApprovalError extends DomainError {
  readonly code = 'SELF_APPROVAL';
  constructor() {
    super('You cannot approve your own discount request.');
  }
}

export class DiscountApprovalNotFoundError extends DomainError {
  readonly code = 'DISCOUNT_APPROVAL_NOT_FOUND';
  constructor() {
    super('Discount approval not found.');
  }
}

export class DiscountApprovalTransitionError extends DomainError {
  readonly code = 'DISCOUNT_APPROVAL_TRANSITION';
  constructor(message: string) {
    super(message);
  }
}
