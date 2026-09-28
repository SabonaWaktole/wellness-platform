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

/**
 * Thrown by a use case whose caller lacks the permission it needs
 * (FR-RBAC-05) — the in-use-case half of the check `requirePermission`
 * makes at the route. Controllers map it to 403 by type, never by message.
 */
export class PermissionDeniedError extends DomainError {
  constructor(
    readonly permissionKey: string,
    message = 'You do not have permission to do this.'
  ) {
    super(message);
  }
}

/**
 * FR-RBAC-08: the change would leave the workspace with no active user who
 * can manage roles, and so no way back into the admin panel. Mapped to 409.
 */
export class LastRoleManagerError extends DomainError {
  readonly code = 'LAST_ROLE_MANAGER';

  constructor() {
    super('This is the last active user who can manage roles. Give someone else that permission first.');
  }
}
