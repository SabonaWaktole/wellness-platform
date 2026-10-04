import { DomainError } from '../../../shared/domain/errors/DomainError';

export type InvalidFollowUpField =
  | 'type'
  | 'dueAt'
  | 'dueDate'
  | 'time'
  | 'intervalDays'
  | 'note'
  | 'reason'
  | 'clientId'
  | 'dealId'
  | 'contactPersonId'
  | 'assignedUserId'
  | 'fromActivityId';

/** A follow-up field is refused. Mapped to 400 with the field, so the form can show it. */
export class InvalidFollowUpError extends DomainError {
  readonly code = 'INVALID_FOLLOW_UP';

  constructor(
    readonly field: InvalidFollowUpField,
    message: string
  ) {
    super(message);
  }
}

/**
 * No such follow-up in this workspace, or one whose salesperson is outside
 * the caller's scope: "not found", never "forbidden" (FR-RBAC-05). Mapped to 404.
 */
export class FollowUpNotFoundError extends DomainError {
  readonly code = 'FOLLOW_UP_NOT_FOUND';

  constructor() {
    super('Follow-up not found.');
  }
}

/** The follow-up was already completed or cancelled (FR-FUP-06). Mapped to 409. */
export class FollowUpClosedError extends DomainError {
  readonly code = 'FOLLOW_UP_CLOSED';

  constructor() {
    super('This follow-up is already completed or cancelled.');
  }
}
