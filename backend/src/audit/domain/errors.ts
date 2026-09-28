import { DomainError } from '../../shared/domain/errors/DomainError';

/** No audit entry with that id in this workspace. Mapped to 404 — same shape as `RoleNotFoundError`. */
export class AuditEntryNotFoundError extends DomainError {
  readonly code = 'AUDIT_ENTRY_NOT_FOUND';

  constructor() {
    super('No audit entry with that id.');
  }
}
