import { DomainError } from '../../../shared/domain/errors/DomainError';

export class InvalidEmailError extends DomainError {
  constructor(email: string) {
    super(`Invalid email format: ${email}`);
  }
}

export class WeakPasswordError extends DomainError {
  constructor() {
    super(
      'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, and one digit',
    );
  }
}

export class InvalidCredentialsError extends DomainError {
  constructor() {
    super('Invalid email or password');
  }
}

export class SlugAlreadyTakenError extends DomainError {
  constructor(slug: string) {
    super(`The URL slug "${slug}" is already taken`);
  }
}

export class InvitationExpiredError extends DomainError {
  constructor() {
    super('This invitation has expired');
  }
}

export class InvitationAlreadyAcceptedError extends DomainError {
  constructor() {
    super('This invitation has already been accepted');
  }
}

/**
 * The invitee already has an account in that workspace. Accepting would create
 * a second one for the same (email, tenantId) pair, which is exactly the key
 * `LoginUseCase` resolves an account by — so the two would be
 * indistinguishable at the login form. Promote the existing account instead.
 */
export class UserAlreadyInWorkspaceError extends DomainError {
  constructor(email: string) {
    super(`"${email}" already has an account in this workspace`);
  }
}

/** An unexpired, unaccepted invitation for that address already exists. */
export class InvitationAlreadyPendingError extends DomainError {
  constructor(email: string) {
    super(`An invitation for "${email}" is already pending in this workspace`);
  }
}

export class TokenExpiredError extends DomainError {
  constructor() {
    super('This token has expired');
  }
}

export class TokenAlreadyUsedError extends DomainError {
  constructor() {
    super('This token has already been used');
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message: string = 'You are not authorized to perform this action') {
    super(message);
  }
}

export class UserNotFoundError extends DomainError {
  constructor(id: string) {
    super(`No user exists with id "${id}"`);
  }
}

/**
 * Suspend/reactivate/delete are platform-administrative actions over
 * ordinary accounts. SUPER_ADMIN accounts are deliberately out of scope: they
 * have no tenant, no ownership to transfer, and locking one out is how a
 * platform loses its own operators.
 *
 * One platform admin acting on ANOTHER stays forbidden for that reason. The
 * single exception is an admin closing their OWN account, which goes through
 * `DeletePlatformAdminSelfUseCase` and is guarded by
 * `LastPlatformAdminError` instead — nobody can be locked out by someone
 * else's decision there, because the only account at stake is the caller's.
 */
export class CannotModifySuperAdminError extends DomainError {
  constructor() {
    super('Super Admin accounts cannot be suspended, reactivated or deleted through this action');
  }
}

/**
 * The caller is the only platform administrator left, so closing their account
 * would leave the platform with no one able to provision workspaces, lift a
 * suspension, or create a replacement admin — a state no one inside the
 * application could recover from (a new SUPER_ADMIN would have to be seeded
 * directly against the database).
 *
 * Deliberately NOT a generic authorization failure: the caller is fully
 * entitled to do this, just not yet. Naming the reason is what tells them the
 * fix is "appoint another admin first".
 */
export class LastPlatformAdminError extends DomainError {
  constructor() {
    super(
      'You are the only platform administrator. Create another one before closing your account.'
    );
  }
}

/**
 * A platform administrator signs in at /login with no workspace slug, which
 * resolves the account through `findAnyByEmail` — a lookup with no tenant
 * filter that returns an arbitrary row when several accounts share an address.
 * A platform admin sharing an email with any workspace account would therefore
 * have a login that resolves to one or the other unpredictably, so the address
 * has to be free across the WHOLE platform, not merely among admins.
 */
export class EmailAlreadyInUseError extends DomainError {
  constructor(email: string) {
    super(`"${email}" is already in use by an account on this platform`);
  }
}

/**
 * The target is a Business Owner with other active staff in the same
 * workspace, so suspending or deleting them cannot proceed without first
 * naming who takes over — see SuspendUserUseCase / DeleteUserUseCase.
 */
export class OwnershipTransferRequiredError extends DomainError {
  constructor() {
    super('This Business Owner has active staff — choose one to become the new Business Owner first');
  }
}

/**
 * The supplied `newOwnerId` is not an active STAFF member of the same
 * tenant as the Business Owner being suspended or deleted.
 */
export class InvalidOwnershipTargetError extends DomainError {
  constructor() {
    super('The selected user is not an eligible staff member of this workspace');
  }
}

/**
 * The target has an unresolved ownership transfer from their suspension, so
 * reactivation cannot proceed without the admin choosing whether to restore
 * the original ownership or keep the acting Business Owner in place.
 */
export class RestoreOwnershipChoiceRequiredError extends DomainError {
  constructor() {
    super('Choose whether to restore original ownership or keep the current Business Owner');
  }
}
