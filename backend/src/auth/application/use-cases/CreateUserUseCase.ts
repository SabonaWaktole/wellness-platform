import { AccessContext } from '../../../access/domain/AccessContext';
import { v4 as uuidv4 } from 'uuid';
import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { IPasswordHasher } from '../ports/IPasswordHasher';
import { User } from '../../domain/entities/User';
import { UserRole } from '../../domain/enums/UserRole';
import { UnauthorizedError } from '../../domain/errors';
import { IRoleCatalogue } from '../../../access/application/ports/IRoleCatalogue';
import { lineageKeyOf } from '../../../access/domain/RoleKey';
import { legacyRoleFor } from '../../../access/domain/LegacyRoleMapping';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { IUserAdminTransaction } from '../ports/IUserAdminTransaction';
import { roleInTenant } from '../userAudit';

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
  /** One of the workspace's roles (FR-USR-02). */
  roleId: string;
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
    private passwordHasher: IPasswordHasher,
    private roles: IRoleCatalogue,
    private writeTx: IUserAdminTransaction
  ) {}

  async execute(input: CreateUserInput) {
    if (!input.access.isPlatformOperator) {
      // The platform operator may staff any workspace — that is the point of
      // the platform console (D2). Anyone else needs users.manage, and may
      // staff their own workspace and no other.
      // `callerTenantId` comes from the verified token and `tenantId` from the
      // resolved URL slug; `resolveTenant` already rejects a mismatch, so this
      // is a second barrier rather than the only one.
      input.access.ensure('users.manage');
      if (input.callerTenantId !== input.tenantId) {
        throw new UnauthorizedError('You cannot create users in another workspace');
      }
    }

    // A role id names the workspace's own roles only, so SUPER_ADMIN — which
    // has no role row (D2) — can never be minted here.
    const role = await roleInTenant(this.roles, input.tenantId, input.roleId);

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
      role: legacyRoleFor(lineageKeyOf(role)) as UserRole,
      roleId: role.id,
      tenantId: input.tenantId,
      warehouseId: input.warehouseId ?? null,
      createdAt: new Date(),
    });

    await this.writeTx.run(async ({ staff, auditTrail }) => {
      await staff.create(user);
      await auditTrail.record({
        tenantId: input.tenantId,
        userId: input.access.userId,
        userRole: input.access.auditRole,
        action: AuditAction.Create,
        entityType: 'User',
        entityId: user.id,
        entityLabel: user.email,
        changes: [
          { field: 'email', old: null, new: user.email },
          { field: 'role', old: null, new: role.key },
        ],
      });
    });

    // The password is not returned, not even to the administrator who just set
    // it: they typed it, and echoing it puts a plaintext credential into
    // response logs for nothing.
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      roleId: user.roleId,
      tenantId: user.tenantId,
      warehouseId: user.warehouseId,
      isActive: user.isActive,
    };
  }
}
