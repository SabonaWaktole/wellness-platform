import { DomainError } from '../../shared/domain/errors/DomainError';

/**
 * Thrown by `ResolveAccessContextUseCase` for a user who no longer exists, is
 * deactivated or is soft-deleted. `loadAccess` maps this to 401 — FR-USR-04's
 * "deactivated user is refused" enforced per request, not only at login,
 * because a still-valid JWT (up to 1h old, see TD-010) carries no record of
 * what happened to the account since it was issued.
 */
export class UserNotAccessibleError extends DomainError {
  constructor() {
    super('This user is deactivated or no longer exists.');
  }
}
