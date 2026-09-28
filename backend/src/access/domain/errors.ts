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

/**
 * FR-RBAC-02, 03: a role edit named a key outside the catalogue, a scoped key
 * without Own/Team/All, a plain capability with a scope, or one key twice.
 * Mapped to 400.
 */
export class InvalidPermissionGrantError extends DomainError {
  readonly code = 'INVALID_PERMISSION_GRANT';

  constructor(
    readonly permissionKey: string,
    message: string
  ) {
    super(message);
  }
}

/** No role with that id in this workspace. Mapped to 404. */
export class RoleNotFoundError extends DomainError {
  readonly code = 'ROLE_NOT_FOUND';

  constructor() {
    super('Role not found.');
  }
}

/**
 * The five system roles (FR-RBAC-01) keep their names and cannot be deleted;
 * only their permissions are edited. Mapped to 409.
 */
export class SystemRoleLockedError extends DomainError {
  readonly code = 'SYSTEM_ROLE_LOCKED';

  constructor() {
    super('System roles cannot be renamed or deleted. Copy the role to make one you can.');
  }
}

/** A custom role still held by users or pending invitations cannot be deleted. Mapped to 409. */
export class RoleInUseError extends DomainError {
  readonly code = 'ROLE_IN_USE';

  constructor(
    readonly users: number,
    readonly invitations: number
  ) {
    super('This role is still assigned. Move its users and invitations to another role first.');
  }
}

/** Another role in the workspace already has this name, in either language. Mapped to 409. */
export class RoleNameTakenError extends DomainError {
  readonly code = 'ROLE_NAME_TAKEN';

  constructor() {
    super('Another role already has this name.');
  }
}
