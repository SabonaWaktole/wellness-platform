import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { IInvitationRepository } from '../../domain/repositories/IInvitationRepository';
import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { ITenantRepository } from '../../../tenant/domain/repositories/ITenantRepository';
import { IEmailSender } from '../ports/IEmailSender';
import { IAuditLogger } from '../../../shared/application/ports/IAuditLogger';
import { Invitation } from '../../domain/entities/Invitation';
import { UserRole } from '../../domain/enums/UserRole';
import {
  UnauthorizedError,
  UserAlreadyInWorkspaceError,
  InvitationAlreadyPendingError,
  EmailAlreadyInUseError,
} from '../../domain/errors';
import { TenantNotFoundError } from '../../../tenant/domain/errors';

/** Same 24 hours `InviteStaffUseCase` gives an invitation. */
const INVITATION_TTL_MS = 24 * 60 * 60 * 1000;

export interface PlatformInviteUserDTO {
  callerRole: string;
  callerId: string;
  /** Absent when inviting a Platform Admin, who belongs to no workspace. */
  tenantId?: string;
  email: string;
  /** Defaults to BUSINESS_OWNER when `tenantId` is present. SUPER_ADMIN is
   *  only valid without a `tenantId` — see the branch below. */
  role?: UserRole;
}

/**
 * Two ways someone is invited by email rather than provisioned directly:
 *
 * 1. Into a workspace, as a Business Owner (default) or Staff — the third
 *    way someone becomes a Business Owner, alongside promotion from staff
 *    (`UpdateUserRoleUseCase`) and an invitation from an owner already inside
 *    the workspace (`InviteStaffUseCase`). ADDS an owner; never replaces one,
 *    because a workspace may have several (see `otherActiveOwners`).
 * 2. As a Platform Admin, tenant-less — one admin appointing another by
 *    email instead of typing a password on their behalf (compare
 *    `CreateUserUseCase`'s direct-create path). Selected by `role ===
 *    SUPER_ADMIN` with no `tenantId`.
 *
 * Both share the same dedupe/invitation/email/audit skeleton; only the scope
 * of the dedupe check, the tenant lookup, and the email wording differ.
 */
export class PlatformInviteUserUseCase {
  constructor(
    private readonly invitationRepository: IInvitationRepository,
    private readonly userRepository: IUserRepository,
    private readonly tenantRepository: ITenantRepository,
    private readonly emailSender: IEmailSender,
    private readonly auditLogger: IAuditLogger
  ) {}

  async execute(dto: PlatformInviteUserDTO): Promise<{ email: string; role: UserRole; token: string }> {
    if (dto.callerRole !== UserRole.SUPER_ADMIN) {
      throw new UnauthorizedError('Only Super Admins can send an invitation');
    }

    const isPlatformAdminInvite = dto.role === UserRole.SUPER_ADMIN;
    if (isPlatformAdminInvite && dto.tenantId) {
      throw new UnauthorizedError('A Platform Admin invitation cannot be scoped to a workspace');
    }
    if (!isPlatformAdminInvite && !dto.tenantId) {
      throw new UnauthorizedError('A workspace invitation requires a tenantId');
    }

    const email = dto.email.trim().toLowerCase();
    const role = isPlatformAdminInvite ? UserRole.SUPER_ADMIN : dto.role ?? UserRole.BUSINESS_OWNER;

    let tenantName: string | undefined;
    if (!isPlatformAdminInvite) {
      const tenant = await this.tenantRepository.findById(dto.tenantId!);
      if (!tenant) {
        throw new TenantNotFoundError(dto.tenantId!);
      }
      tenantName = tenant.name;

      // Accepting the invitation would create a SECOND account for the same
      // person in the same workspace — `LoginUseCase` looks accounts up by
      // (email, tenantId), so the two would be indistinguishable at the
      // login form. Someone already inside the workspace is promoted
      // instead, which is what `UpdateUserRoleUseCase` is for.
      const existing = await this.userRepository.findByEmail(email, dto.tenantId!);
      if (existing && !existing.deletedAt) {
        throw new UserAlreadyInWorkspaceError(email);
      }
    } else {
      // Unique across the ENTIRE platform, same reasoning as
      // `CreatePlatformAdminUseCase`: a platform admin signs in with no
      // workspace slug, resolved via `findAnyByEmail` with no tenant filter.
      const existing = await this.userRepository.findAnyByEmail(email);
      if (existing && !existing.deletedAt) {
        throw new EmailAlreadyInUseError(email);
      }
    }

    const pending = await this.invitationRepository.findByTenantId(isPlatformAdminInvite ? null : dto.tenantId!);
    if (pending.some((i) => i.email.toLowerCase() === email && !i.isAccepted() && !i.isExpired())) {
      throw new InvitationAlreadyPendingError(email);
    }

    const invitation = Invitation.create({
      id: uuidv4(),
      tenantId: isPlatformAdminInvite ? null : dto.tenantId!,
      email,
      role,
      token: crypto.randomBytes(32).toString('hex'),
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      acceptedAt: null,
      warehouseId: null,
      // The Platform Admin, so "your invitation was accepted" reaches the
      // person who actually sent it rather than the workspace's owners.
      invitedByUserId: dto.callerId,
    });

    await this.invitationRepository.create(invitation);

    await this.auditLogger.record({
      actorUserId: dto.callerId,
      actorRole: dto.callerRole,
      action: isPlatformAdminInvite ? 'PLATFORM_ADMIN_INVITED' : 'USER_INVITED',
      targetType: 'INVITATION',
      targetId: invitation.id,
      tenantId: isPlatformAdminInvite ? null : dto.tenantId!,
      metadata: { email, role, invitedBy: 'PLATFORM_ADMIN' },
    });

    // Best-effort and unawaited, matching `InviteStaffUseCase`: the invitation
    // row is the record that matters, and a slow mail provider must not turn a
    // created invitation into a failed request. The token is returned so the
    // console can surface the link if the mail never lands.
    this.emailSender.sendInvitationEmail(email, invitation.token, tenantName).catch((err) => {
      console.error('Failed to send platform invitation email in background:', err);
    });

    return { email, role, token: invitation.token };
  }
}
