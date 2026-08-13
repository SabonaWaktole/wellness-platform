import { v4 as uuidv4 } from 'uuid';
import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { IPasswordHasher } from '../ports/IPasswordHasher';
import { IAuditLogger } from '../../../shared/application/ports/IAuditLogger';
import { User } from '../../domain/entities/User';
import { UserRole } from '../../domain/enums/UserRole';
import { UnauthorizedError, EmailAlreadyInUseError } from '../../domain/errors';

export interface CreatePlatformAdminDTO {
  callerRole: string;
  callerId: string;
  email: string;
  password: string;
  firstName?: string | null;
  lastName?: string | null;
}

/**
 * One platform administrator appointing another.
 *
 * This is deliberately NOT part of `CreateUserUseCase`, which still refuses
 * the SUPER_ADMIN role for every caller. That refusal was never about the role
 * being uncreatable — it was about the ROUTE: `CreateUserUseCase` provisions an
 * account *inside a workspace*, and a platform admin belongs to none, so
 * "create a SUPER_ADMIN in tenant X" is not a request that can be honoured.
 * Keeping that endpoint's blanket refusal intact means a compromised Business
 * Owner session still cannot mint platform access, which is the property that
 * mattered; this use case is reachable only by an existing SUPER_ADMIN, so the
 * privilege is passed on by someone who already holds it rather than escalated
 * into.
 *
 * Credentials are set here rather than emailed as an invitation, matching
 * `CreateUserUseCase`: the invitation flow resolves a token against a TENANT
 * (`Invitation.tenantId` is non-nullable), so it has nowhere to put an account
 * that has no workspace.
 */
export class CreatePlatformAdminUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly passwordHasher: IPasswordHasher,
    private readonly auditLogger: IAuditLogger
  ) {}

  async execute(dto: CreatePlatformAdminDTO): Promise<{
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: UserRole;
  }> {
    if (dto.callerRole !== UserRole.SUPER_ADMIN) {
      throw new UnauthorizedError('Only platform administrators can appoint another one');
    }

    const email = dto.email.trim().toLowerCase();

    /*
     * Unique across the ENTIRE platform, which is stricter than the per-workspace
     * rule `CreateUserUseCase` applies.
     *
     * A platform admin signs in at /login with no slug, and that path resolves
     * the account with `findAnyByEmail` — no tenant filter, `findFirst`, so with
     * two rows sharing an address the winner is whatever the database returns
     * first. Allowing the collision would not produce a clear error at login; it
     * would produce an account that sometimes signs in as the wrong person.
     *
     * Like the per-workspace check it mirrors, this is a check and not a
     * race-free constraint: `User.email` carries no unique index anywhere in the
     * schema.
     */
    const existing = await this.userRepository.findAnyByEmail(email);
    if (existing && !existing.deletedAt) {
      throw new EmailAlreadyInUseError(email);
    }

    const hashedPassword = await this.passwordHasher.hash(dto.password);

    // Through the entity, so the "SUPER_ADMIN must not be associated with a
    // tenant" invariant is enforced here too rather than only by the null we
    // happen to pass.
    const admin = User.create({
      id: uuidv4(),
      email,
      hashedPassword,
      firstName: dto.firstName?.trim() || null,
      lastName: dto.lastName?.trim() || null,
      phone: null,
      role: UserRole.SUPER_ADMIN,
      tenantId: null,
      createdAt: new Date(),
    });

    await this.userRepository.create(admin);

    await this.auditLogger.record({
      actorUserId: dto.callerId,
      actorRole: dto.callerRole,
      action: 'PLATFORM_ADMIN_CREATED',
      targetType: 'USER',
      targetId: admin.id,
      // No tenant: this account belongs to the platform, not a workspace.
      tenantId: null,
      metadata: { email },
    });

    // The password is not echoed back, for the same reason `CreateUserUseCase`
    // withholds it: the caller typed it, and returning it puts a plaintext
    // credential into response logs for nothing.
    return {
      id: admin.id,
      email: admin.email,
      firstName: admin.firstName,
      lastName: admin.lastName,
      role: admin.role,
    };
  }
}
