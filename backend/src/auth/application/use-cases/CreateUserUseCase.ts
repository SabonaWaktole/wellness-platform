import { AccessContext } from '../../../access/domain/AccessContext';
import { v4 as uuidv4 } from 'uuid';
import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { IPasswordHasher } from '../ports/IPasswordHasher';
import { User } from '../../domain/entities/User';
import { UserRole } from '../../domain/enums/UserRole';
import { UnauthorizedError } from '../../domain/errors';

export interface CreateUserInput {
  access: AccessContext;
  /** Null for SUPER_ADMIN, who belongs to no workspace. */
  callerTenantId: string | null;
  /** The workspace the new account belongs to. */
  tenantId: string;
  email: string;
  password: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  role: UserRole;
  warehouseId?: string | null;
}

/**
 * Creates a user account with credentials already set, as opposed to
 * `InviteStaffUseCase`, which creates only an invitation the recipient must
 * accept before an account exists.
 *
 * Both paths remain: this one is for an administrator provisioning an account
 * and handing over the password directly; the invitation flow is for letting
 * someone choose their own. They share nothing but the resulting `User`, so
 * neither is expressed in terms of the other.
 */
export class CreateUserUseCase {
  constructor(
    private userRepository: IUserRepository,
    private passwordHasher: IPasswordHasher
  ) {}

  async execute(input: CreateUserInput) {
    /*
     * SUPER_ADMIN is seeded, never created through the API.
     *
     * Checked before the caller checks below, so the answer does not depend on
     * who is asking: there is no caller for whom this is allowed. The role
     * grants access to every workspace on the platform, and an endpoint that
     * can mint one turns a single compromised owner session into full platform
     * access. See scratch/seed-super-admin.ts.
     */
    if (input.role === UserRole.SUPER_ADMIN) {
      throw new UnauthorizedError('Platform administrators cannot be created through this endpoint');
    }

    if (!input.access.isPlatformOperator) {
      // The platform operator may create either role, in any workspace — that
      // is the point of the platform console (D2). Anyone else needs
      // users.manage, and may staff their own workspace and no other.
      // `callerTenantId` comes from the verified token and `tenantId` from the
      // resolved URL slug; `resolveTenant` already rejects a mismatch, so this
      // is a second barrier rather than the only one.
      input.access.ensure('users.manage');
      if (input.callerTenantId !== input.tenantId) {
        throw new UnauthorizedError('You cannot create users in another workspace');
      }
      // Choosing one of the five roles for a new account is Slice 5; until
      // then a workspace administrator creates Staff (Sales User) accounts.
      if (input.role !== UserRole.STAFF) {
        throw new UnauthorizedError('Workspace administrators can only create Staff accounts');
      }
    }

    // Uniqueness is per workspace, matching how `LoginUseCase` looks an account
    // up: `findByEmail(email, tenantId)`. Two workspaces may each have an
    // account for the same person. The schema has no unique constraint to lean
    // on (not even a composite one), so this check is the whole guarantee — and
    // it is a check, not a race-free constraint.
    const existing = await this.userRepository.findByEmail(input.email, input.tenantId);
    if (existing) {
      throw new Error('A user with this email already exists in this workspace');
    }

    const hashedPassword = await this.passwordHasher.hash(input.password);

    const user = User.create({
      id: uuidv4(),
      email: input.email,
      hashedPassword,
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      phone: input.phone ?? null,
      role: input.role,
      tenantId: input.tenantId,
      warehouseId: input.warehouseId ?? null,
      createdAt: new Date(),
    });

    await this.userRepository.create(user);

    // The password is not returned, not even to the administrator who just set
    // it: they typed it, and echoing it puts a plaintext credential into
    // response logs for nothing.
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      tenantId: user.tenantId,
      warehouseId: user.warehouseId,
      isActive: user.isActive,
    };
  }
}
