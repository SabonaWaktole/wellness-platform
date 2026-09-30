import { Request, Response } from 'express';
import { LastRoleManagerError, PermissionDeniedError } from '../../../../access/domain/errors';
import { ListRolesUseCase } from '../../../../access/application/use-cases/ListRolesUseCase';
import {
  InvalidReassignmentTargetError,
  ReassignmentRequiredError,
  UnauthorizedError,
  UnknownRoleError,
} from '@auth/domain/errors';
import { requireTenant, requireTenantId } from "@main/interfaces/http/tenantContext";
import { authCookieOptions, AUTH_COOKIE_MAX_AGE_MS } from "@main/interfaces/http/authCookie";
import { LoginUseCase } from '@auth/application/use-cases/LoginUseCase';
import { CreateUserUseCase } from '@auth/application/use-cases/CreateUserUseCase';
import { ExitTenantUseCase } from '@tenant/application/use-cases/ExitTenantUseCase';
import { InviteStaffUseCase } from '@auth/application/use-cases/InviteStaffUseCase';
import { AcceptInvitationUseCase } from '@auth/application/use-cases/AcceptInvitationUseCase';
import { RequestPasswordResetUseCase } from '@auth/application/use-cases/RequestPasswordResetUseCase';
import { ResetPasswordUseCase } from '@auth/application/use-cases/ResetPasswordUseCase';
import { GetTenantStaffUseCase } from '@auth/application/use-cases/GetTenantStaffUseCase';
import { GetPendingInvitationsUseCase } from '@auth/application/use-cases/GetPendingInvitationsUseCase';
import { UpdateUserProfileUseCase } from '@auth/application/use-cases/UpdateUserProfileUseCase';
import { ChangePasswordUseCase } from '@auth/application/use-cases/ChangePasswordUseCase';
import { GetUserProfileUseCase } from '@auth/application/use-cases/GetUserProfileUseCase';
import { UpdateUserRoleUseCase } from '@auth/application/use-cases/UpdateUserRoleUseCase';
import { CancelInvitationUseCase } from '@auth/application/use-cases/CancelInvitationUseCase';
import { ReactivateUserUseCase } from '../../../application/use-cases/ReactivateUserUseCase';
import { DeactivateUserUseCase } from '@auth/application/use-cases/DeactivateUserUseCase';
import { GetDeactivationImpactUseCase } from '@auth/application/use-cases/GetDeactivationImpactUseCase';
import { ITenantRepository } from '@tenant/domain/repositories/ITenantRepository';
import { UserRole } from '@auth/domain/enums/UserRole';
import { ResolveAccessContextUseCase } from '../../../../access/application/use-cases/ResolveAccessContextUseCase';
/**
 * Status codes for the user-administration handlers. Mapped by error type,
 * never by message, and each carries a `code` the Team page translates.
 */
function sendUserAdminError(res: Response, error: any) {
  if (error instanceof PermissionDeniedError || error instanceof UnauthorizedError) {
    return res.status(403).json({ error: error.message });
  }
  if (error instanceof LastRoleManagerError || error instanceof ReassignmentRequiredError) {
    const detail = error instanceof ReassignmentRequiredError ? { companies: error.companies } : {};
    return res.status(409).json({ error: error.message, code: error.code, ...detail });
  }
  if (error instanceof UnknownRoleError || error instanceof InvalidReassignmentTargetError) {
    return res.status(400).json({ error: error.message, code: error.code });
  }
  return res.status(400).json({ error: error.message });
}

export class AuthController {
  constructor(
    private loginUseCase: LoginUseCase,
    private inviteStaffUseCase: InviteStaffUseCase,
    private acceptInvitationUseCase: AcceptInvitationUseCase,
    private requestPasswordResetUseCase: RequestPasswordResetUseCase,
    private resetPasswordUseCase: ResetPasswordUseCase,
    private tenantRepository: ITenantRepository,
    private getTenantStaffUseCase: GetTenantStaffUseCase,
    private getPendingInvitationsUseCase: GetPendingInvitationsUseCase,
    private updateUserProfileUseCase: UpdateUserProfileUseCase,
    private getUserProfileUseCase: GetUserProfileUseCase,
    private updateUserRoleUseCase: UpdateUserRoleUseCase,
    private cancelInvitationUseCase?: CancelInvitationUseCase,
    private deactivateUserUseCase?: DeactivateUserUseCase,
    private getDeactivationImpactUseCase?: GetDeactivationImpactUseCase,
    private reactivateUserUseCase?: ReactivateUserUseCase,
    private createUserUseCase?: CreateUserUseCase,
    private exitTenantUseCase?: ExitTenantUseCase,
    private changePasswordUseCase?: ChangePasswordUseCase,
    private resolveAccessContext?: ResolveAccessContextUseCase,
    private listRolesUseCase?: ListRolesUseCase
  ) {}

  listRoles = async (req: Request, res: Response) => {
    try {
      const roles = await this.listRolesUseCase!.execute({ access: req.access!, tenantId: requireTenantId(req) });
      res.status(200).json({ roles });
    } catch (error: any) {
      sendUserAdminError(res, error);
    }
  };

  loginTenant = async (req: Request, res: Response) => {
    try {
      const result = await this.loginUseCase.execute({ ...req.body, tenantSlug: requireTenant(req).urlSlug });
      res.cookie('jwt', result.token, { ...authCookieOptions(), maxAge: AUTH_COOKIE_MAX_AGE_MS });
      res.status(200).json({ message: 'Login successful' });
    } catch (error: any) {
      res.status(401).json({ error: error.message });
    }
  };

  loginGlobal = async (req: Request, res: Response) => {
    try {
      const result = await this.loginUseCase.execute({ ...req.body, tenantSlug: null });
      res.cookie('jwt', result.token, { ...authCookieOptions(), maxAge: AUTH_COOKIE_MAX_AGE_MS });
      res.status(200).json({ message: 'Login successful', tenantSlug: result.tenantSlug });
    } catch (error: any) {
      res.status(401).json({ error: error.message });
    }
  };

  logout = async (req: Request, res: Response) => {
    res.clearCookie('jwt', authCookieOptions());
    res.status(200).json({ message: 'Logged out successfully' });
  };

  /**
   * Leave a workspace a platform administrator had entered, returning to the
   * platform session. Authorised by the token's `impersonatorId` claim rather
   * than by role — see ExitTenantUseCase.
   */
  exitWorkspace = async (req: Request, res: Response) => {
    try {
      const result = await this.exitTenantUseCase!.execute({
        impersonatorId: req.user!.impersonatorId,
      });
      res.cookie('jwt', result.token, { ...authCookieOptions(), maxAge: AUTH_COOKIE_MAX_AGE_MS });
      res.status(200).json({ message: 'Returned to platform console' });
    } catch (error: any) {
      res.status(403).json({ error: error.message });
    }
  };

  createUser = async (req: Request, res: Response) => {
    try {
      const user = await this.createUserUseCase!.execute({
        access: req.access!,
        callerTenantId: req.user!.tenantId,
        // The workspace resolved from the URL slug, never req.user.tenantId —
        // the two diverge for an impersonating administrator. See tenantContext.
        tenantId: requireTenantId(req),
        email: req.body.email,
        password: req.body.password,
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        phone: req.body.phone,
        roleId: req.body.roleId,
        warehouseId: req.body.warehouseId,
      });
      res.status(201).json({ user });
    } catch (error: any) {
      sendUserAdminError(res, error);
    }
  };

  getMe = async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(200).json({ user: null });
    }
    try {
      const user = await this.getUserProfileUseCase.execute(req.user.userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Session bootstrap is the one authenticated path that re-reads the user,
      // so it is where a deactivated account can still be caught. The
      // authenticate middleware only verifies the JWT signature and never hits
      // the database, so an already-issued token keeps working against other
      // endpoints until it expires (JWT_EXPIRATION, 24h by default). Rejecting
      // here drops the browser session on the next load; it is a practical
      // shortening of exposure, not true revocation. See TD-010.
      if (!user.isActive) {
        res.clearCookie('jwt', authCookieOptions());
        return res.status(401).json({ error: 'This account has been deactivated.' });
      }

      /*
       * While a platform administrator is managing a workspace, the SESSION and
       * the USER RECORD disagree, and the session is what the app must render.
       *
       * The record says `role: SUPER_ADMIN, tenantId: null` — that is who they
       * are on the platform. The token says `role: BUSINESS_OWNER` and names the
       * workspace they entered — that is what this session can actually do, and
       * it is what every route already enforces. Reporting the record here sent
       * the SPA the platform sidebar and no workspace branding while the URL sat
       * on /:tenantSlug, so the console rendered inside a client's workspace
       * with none of that workspace's currency, timezone or logo.
       *
       * Only the impersonation case is overridden. For an ordinary session the
       * record is still preferred, deliberately: it is the fresher of the two,
       * so an owner demoted to STAFF mid-session has the UI downgraded on their
       * next load rather than waiting for the token to expire (TD-010).
       */
      const isImpersonating = Boolean(req.user.impersonatorId);
      const effectiveRole = isImpersonating ? req.user.role : user.role;
      const effectiveTenantId = isImpersonating ? req.user.tenantId : user.tenantId;

      // Media URLs are read straight from Prisma rather than through the User
      // entity: they are presentation-only strings with no domain behaviour,
      // and threading them through the entity would mean touching its
      // constructor and every repository mapping for no benefit.
      //
      // The tenant's branding is returned on the same call so the sidebar and
      // header can render the workspace logo without a second round trip.
      const { prisma } = require('../../../../shared/infrastructure/prisma/client');
      const [media, tenantBranding] = await Promise.all([
        prisma.user.findUnique({
          where: { id: user.id },
          select: { avatarUrl: true, coverImageUrl: true },
        }),
        effectiveTenantId
          ? prisma.tenant.findUnique({
              where: { id: effectiveTenantId },
              // currency and locale ride along with the branding for the same
              // reason: the money formatter is used on nearly every page, and
              // making each one fetch settings separately would be a round trip
              // per page for two short strings.
              select: {
                logoUrl: true, coverImageUrl: true, name: true,
                currency: true, locale: true, defaultLanguage: true,
                timezone: true, dateFormat: true,
                // Selected purely to gate the session below, not to return.
                subscriptionStatus: true,
              },
            })
          : Promise.resolve(null),
      ]);

      /*
       * Suspended workspace drops the browser session, exactly as a deactivated
       * account does above.
       *
       * `resolveTenant` already blocks every `/api/:tenantSlug/...` route, but
       * this endpoint is global — it carries no slug and so never passes
       * through that middleware. Without this check a suspended tenant's user
       * would bootstrap a perfectly normal-looking session and then hit 403 on
       * every subsequent call, which reads as the app being broken rather than
       * as the workspace being suspended.
       *
       * SUPER_ADMIN is unaffected: `tenantBranding` is null for them, since
       * they have no tenantId.
       */
      if (tenantBranding?.subscriptionStatus === 'SUSPENDED') {
        res.clearCookie('jwt', authCookieOptions());
        return res.status(403).json({
          error: 'This workspace is suspended :( contact support',
          code: 'TENANT_SUSPENDED',
        });
      }

      // Slice 3 (FR-RBAC-01, enabler for FR-USR-03): the permissions this
      // session actually has, resolved the same way `loadAccess` does for
      // every tenant-scoped request — SUPER_ADMIN and impersonation both
      // short-circuit to platformOperator() inside the use case. Optional
      // because a handful of test doubles still construct AuthController
      // without it; a session without it simply carries no permissions.
      let permissions: Record<string, unknown> = {};
      let permissionsVersion: string | undefined;
      if (this.resolveAccessContext && effectiveTenantId) {
        const access = await this.resolveAccessContext.execute({
          userId: user.id,
          tenantId: effectiveTenantId,
          legacyRole: effectiveRole,
          impersonatorId: req.user.impersonatorId ?? null,
        });
        permissions = access.toJSON();
        permissionsVersion = access.version;
        res.setHeader('X-Permissions-Version', permissionsVersion);
      } else if (this.resolveAccessContext && effectiveRole === UserRole.SUPER_ADMIN) {
        const access = await this.resolveAccessContext.execute({
          userId: user.id,
          tenantId: null,
          legacyRole: effectiveRole,
        });
        permissions = access.toJSON();
        permissionsVersion = access.version;
        res.setHeader('X-Permissions-Version', permissionsVersion);
      }

      res.status(200).json({
        user: {
          userId: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          // Both from the session while impersonating — see effectiveRole above.
          role: effectiveRole,
          tenantId: effectiveTenantId,
          tenantSlug: req.user.tenantSlug,
          warehouseId: user.warehouseId,
          avatarUrl: media?.avatarUrl ?? null,
          coverImageUrl: media?.coverImageUrl ?? null,
          tenantName: tenantBranding?.name ?? null,
          tenantLogoUrl: tenantBranding?.logoUrl ?? null,
          tenantCoverImageUrl: tenantBranding?.coverImageUrl ?? null,
          // Null only for SUPER_ADMIN, who has no tenant. Every tenant row has
          // these columns NOT NULL, so a tenanted user always gets real values.
          tenantCurrency: tenantBranding?.currency ?? null,
          tenantLocale: tenantBranding?.locale ?? null,
          tenantTimezone: tenantBranding?.timezone ?? null,
          tenantDateFormat: tenantBranding?.dateFormat ?? null,
          // Interface language, kept separate from the formatting fields above.
          // `userLanguage` is null when the user follows the workspace default;
          // the client needs the raw value, not just the resolved one, so the
          // settings UI can show "Follow company default" as selected.
          userLanguage: user.language ?? null,
          tenantDefaultLanguage: tenantBranding?.defaultLanguage ?? null,
          // Slice 3: { [permissionKey]: scope | true }, from AccessContext.toJSON().
          permissions,
          permissionsVersion: permissionsVersion ?? null,
        },
        /*
         * Non-null while a platform administrator is managing this workspace.
         *
         * Returned from the TOKEN rather than re-derived: `user` here is the
         * administrator's own record, whose stored role is SUPER_ADMIN and whose
         * tenantId is null, so nothing about the swapped session is visible in
         * it. The claim is what the session actually is.
         *
         * It rides on /auth/me rather than only on the enter response so the
         * banner survives a page reload — otherwise an administrator who
         * refreshed would be operating inside a client's workspace with no
         * indication that they were.
         */
        impersonating: req.user.impersonatorId
          ? {
              adminEmail: req.user.impersonatorEmail ?? null,
              tenantSlug: req.user.tenantSlug,
              tenantName: tenantBranding?.name ?? null,
            }
          : null,
      });
    } catch (error: any) {
      // Log internally; never return the raw message to the client.
      console.error('GET /auth/me failed:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  inviteStaff = async (req: Request, res: Response) => {
    try {
      const tenant = await this.tenantRepository.findById(requireTenantId(req));
      const result = await this.inviteStaffUseCase.execute({
        invitingUserId: req.user!.userId,
        access: req.access!,
        tenantId: requireTenantId(req),
        inviteeEmail: req.body.email,
        roleId: req.body.roleId,
        warehouseId: req.body.warehouseId,
        tenantName: tenant!.name,
        language: tenant!.defaultLanguage,
      });
      res.status(200).json({ message: 'Invitation sent' });
    } catch (error: any) {
      sendUserAdminError(res, error);
    }
  };

  updateStaffRole = async (req: Request, res: Response) => {
    try {
      await this.updateUserRoleUseCase.execute({
        access: req.access!,
        tenantId: requireTenantId(req),
        userIdToUpdate: req.params.id as string,
        newRoleId: req.body.roleId,
        newWarehouseId: req.body.warehouseId ?? null,
      });
      res.status(200).json({ message: 'User role and permissions updated' });
    } catch (error: any) {
      sendUserAdminError(res, error);
    }
  };

  getDeactivationImpact = async (req: Request, res: Response) => {
    try {
      const impact = await this.getDeactivationImpactUseCase!.execute({
        access: req.access!,
        tenantId: requireTenantId(req),
        userId: req.params.id as string,
      });
      res.status(200).json(impact);
    } catch (error: any) {
      if (error instanceof PermissionDeniedError || error.message.includes('Unauthorized')) {
        return res.status(403).json({ error: error.message });
      }
      res.status(400).json({ error: error.message });
    }
  };

  deactivateStaff = async (req: Request, res: Response) => {
    try {
      const result = await this.deactivateUserUseCase!.execute({
        access: req.access!,
        requestingUserId: req.user!.userId,
        tenantId: requireTenantId(req),
        userIdToDeactivate: req.params.id as string,
        reassignToUserId: req.body?.reassignToUserId ?? null,
      });
      res.status(200).json({ message: 'Team member deactivated', reassigned: result.reassigned });
    } catch (error: any) {
      sendUserAdminError(res, error);
    }
  };

  reactivateStaff = async (req: Request, res: Response) => {
    try {
      await this.reactivateUserUseCase!.execute({
        access: req.access!,
        tenantId: requireTenantId(req),
        userIdToReactivate: req.params.id as string,
      });
      res.status(200).json({ message: 'Team member reactivated' });
    } catch (error: any) {
      sendUserAdminError(res, error);
    }
  };

  acceptInvitation = async (req: Request, res: Response) => {
    try {
      const result = await this.acceptInvitationUseCase.execute(req.body);
      res.status(200).json({ message: 'Invitation accepted successfully', tenantSlug: result.tenantSlug });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  };

  requestPasswordReset = async (req: Request, res: Response) => {
    try {
      await this.requestPasswordResetUseCase.execute({
        email: req.body.email,
        tenantId: requireTenantId(req),
      });
      res.status(200).json({ message: 'If the email exists, a reset link has been sent.' });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  };

  /**
   * For users with no tenant context at the point of asking — a platform
   * administrator, or anyone on the shared /login screen, which carries no
   * slug. Looks the email up across every workspace instead of one.
   */
  requestPasswordResetGlobal = async (req: Request, res: Response) => {
    try {
      await this.requestPasswordResetUseCase.execute({
        email: req.body.email,
        tenantId: null,
      });
      res.status(200).json({ message: 'If the email exists, a reset link has been sent.' });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  };

  resetPassword = async (req: Request, res: Response) => {
    try {
      await this.resetPasswordUseCase.execute(req.body);
      res.status(200).json({ message: 'Password reset successfully' });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  };

  getTenantStaff = async (req: Request, res: Response, next: Function) => {
    try {
      const result = await this.getTenantStaffUseCase.execute({ tenantId: requireTenantId(req) });
      res.json(result);
    } catch (error: any) {
      next(error);
    }
  };

  getPendingInvitations = async (req: Request, res: Response, next: Function) => {
    try {
      const result = await this.getPendingInvitationsUseCase.execute({
        tenantId: requireTenantId(req),
        access: req.access!,
      });
      res.json(result);
    } catch (error: any) {
      next(error);
    }
  };
  updateMe = async (req: Request, res: Response, next: any) => {
    try {
      await this.updateUserProfileUseCase.execute({
        userId: req.user!.userId,
        requestingUserId: req.user!.userId,
        access: req.access!,
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        phone: req.body.phone,
        email: req.body.email,
        language: req.body.language,
      });
      res.status(200).json({ message: 'Profile updated successfully' });
    } catch (error: any) {
      if (error instanceof PermissionDeniedError || error.name === 'UnauthorizedError') {
        res.status(403).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  };

  changeMyPassword = async (req: Request, res: Response) => {
    try {
      await this.changePasswordUseCase!.execute({
        userId: req.user!.userId,
        currentPassword: req.body.currentPassword,
        newPassword: req.body.newPassword,
      });
      res.status(200).json({ message: 'Password changed successfully' });
    } catch (error: any) {
      if (error instanceof PermissionDeniedError || error.name === 'UnauthorizedError') {
        res.status(403).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  };

  cancelInvitation = async (req: Request, res: Response, next: any) => {
    try {
      if (this.cancelInvitationUseCase) {
        await this.cancelInvitationUseCase.execute({
          invitationId: req.params.id as string,
          access: req.access!,
        });
      }
      res.status(200).json({ message: 'Invitation canceled successfully' });
    } catch (error: any) {
      next(error);
    }
  };
}
