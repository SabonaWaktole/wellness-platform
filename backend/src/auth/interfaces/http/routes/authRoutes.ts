import { Router } from 'express';
import { AuthController } from '@auth/interfaces/http/controllers/AuthController';
import { validateRequest } from '@main/interfaces/http/middlewares/validateRequest';
import { authSchemas } from '@auth/interfaces/http/schemas/authSchemas';
import { authenticate } from '@main/interfaces/http/middlewares/authenticate';
import { optionalAuthenticate } from '@main/interfaces/http/middlewares/optionalAuthenticate';
import { resolveTenant } from '@main/interfaces/http/middlewares/resolveTenant';
import { ITokenService } from '@auth/application/ports/ITokenService';
import { ITenantRepository } from '@tenant/domain/repositories/ITenantRepository';
import { createAuthRateLimiter } from '@main/interfaces/http/middlewares/authRateLimit';
import { loadAccess } from '@main/interfaces/http/middlewares/loadAccess';
import { requirePermission } from '@main/interfaces/http/middlewares/requirePermission';
import { ResolveAccessContextUseCase } from '../../../../access/application/use-cases/ResolveAccessContextUseCase';

export const createGlobalAuthRoutes = (
  authController: AuthController,
  tokenService: ITokenService,
): Router => {
  const router = Router();
  const authMw = authenticate(tokenService);
  const optionalAuthMw = optionalAuthenticate(tokenService);
  const authLimiter = createAuthRateLimiter();

  router.post('/login', authLimiter, validateRequest(authSchemas.login), authController.loginGlobal);
  router.post('/logout', authController.logout);

  /*
   * The return leg of POST /api/tenants/:id/enter.
   *
   * It lives on the GLOBAL auth router rather than the tenant one for two
   * reasons. It carries no slug — the caller is leaving a workspace, not acting
   * within one — and it cannot sit under /api/tenants because that router is
   * `authorize([SUPER_ADMIN])` and an impersonation token reads
   * `role: BUSINESS_OWNER`, so the very caller who needs this route would be
   * turned away at the door.
   *
   * `authenticate` alone is the guard here; authorisation is the `impersonatorId`
   * claim, which only EnterTenantUseCase sets, checked inside ExitTenantUseCase.
   */
  router.post('/exit-workspace', authMw, authController.exitWorkspace);


  router.post('/invitations/accept', validateRequest(authSchemas.acceptInvitation), authController.acceptInvitation);
  router.post('/password-reset/request', authLimiter, validateRequest(authSchemas.requestPasswordReset), authController.requestPasswordResetGlobal);
  router.post('/password-reset/reset', validateRequest(authSchemas.resetPassword), authController.resetPassword);

  // Profile endpoints
  router.get('/me', optionalAuthMw, authController.getMe);
  router.put('/me', authMw, validateRequest(authSchemas.updateProfile), authController.updateMe);
  router.put('/me/password', authMw, validateRequest(authSchemas.changePassword), authController.changeMyPassword);

  return router;
};

export const createTenantAuthRoutes = (
  authController: AuthController,
  tokenService: ITokenService,
  tenantRepository: ITenantRepository,
  resolveAccessContext: ResolveAccessContextUseCase
): Router => {
  const router = Router({ mergeParams: true });
  const authMw = authenticate(tokenService);
  const resolveTenantMw = resolveTenant(tenantRepository);
  const loadAccessMw = loadAccess(resolveAccessContext);
  const authLimiter = createAuthRateLimiter();

  /*
   * Login resolves the tenant but does NOT get bounced here when it is
   * suspended — `LoginUseCase` rejects it after checking the password instead,
   * so the endpoint cannot be used to enumerate suspended workspaces. Every
   * other route below keeps the default block. See ResolveTenantOptions.
   */
  const resolveTenantForLoginMw = resolveTenant(tenantRepository, { allowSuspended: true });

  router.post('/login', authLimiter, resolveTenantForLoginMw, validateRequest(authSchemas.login), authController.loginTenant);
  router.post('/password-reset/request', authLimiter, resolveTenantMw, validateRequest(authSchemas.requestPasswordReset), authController.requestPasswordReset);

  router.post(
    '/invitations',
    authMw,
    resolveTenantMw,
    loadAccessMw,
    requirePermission('users.manage'),
    validateRequest(authSchemas.inviteStaff),
    authController.inviteStaff
  );

  router.get(
    '/invitations',
    authMw,
    resolveTenantMw,
    loadAccessMw,
    requirePermission('users.manage'),
    authController.getPendingInvitations
  );

  router.delete(
    '/invitations/:id',
    authMw,
    resolveTenantMw,
    loadAccessMw,
    requirePermission('users.manage'),
    authController.cancelInvitation
  );

  /*
   * Create a team member with credentials already set — the primary way a
   * workspace gains people. The invitation routes above remain for the case
   * where the recipient should choose their own password.
   *
   * BUSINESS_OWNER only, and SUPER_ADMIN is deliberately NOT listed: a platform
   * administrator reaching this route is doing so with a workspace session
   * minted by /api/tenants/:id/enter, which reads BUSINESS_OWNER, so they pass.
   * A platform-session SUPER_ADMIN would be stopped by `resolveTenant` long
   * before this guard anyway; the console's own super-admin-only way to add
   * someone is POST /api/tenants/:id/invitations (or /platform-admins/invitations).
   */
  router.post(
    '/users',
    authMw,
    resolveTenantMw,
    loadAccessMw,
    requirePermission('users.manage'),
    validateRequest(authSchemas.createUser),
    authController.createUser
  );

  // companies.view: every one of the five roles holds it (Reception and CEO
  // at ALL, the rest at OWN/TEAM), so this stays reachable by any tenant
  // user — the same "any authenticated tenant user" gate BUSINESS_OWNER +
  // STAFF gave before Slice 3.
  router.get(
    '/staff',
    authMw,
    resolveTenantMw,
    loadAccessMw,
    requirePermission('companies.view'),
    authController.getTenantStaff
  );

  // users.manage: deactivation revokes access, and the impact lookup
  // reveals how much work a colleague holds.
  router.get(
    '/staff/:id/deactivation-impact',
    authMw,
    resolveTenantMw,
    loadAccessMw,
    requirePermission('users.manage'),
    authController.getDeactivationImpact
  );

  router.post(
    '/staff/:id/deactivate',
    authMw,
    resolveTenantMw,
    loadAccessMw,
    requirePermission('users.manage'),
    authController.deactivateStaff
  );

  router.post(
    '/staff/:id/reactivate',
    authMw,
    resolveTenantMw,
    loadAccessMw,
    requirePermission('users.manage'),
    authController.reactivateStaff
  );

  router.put(
    '/staff/:id',
    authMw,
    resolveTenantMw,
    loadAccessMw,
    requirePermission('users.manage'),
    validateRequest(authSchemas.updateStaffRole),
    authController.updateStaffRole
  );

  return router;
};
