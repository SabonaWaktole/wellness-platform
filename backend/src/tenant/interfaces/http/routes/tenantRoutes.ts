import { Router, Request, Response, NextFunction } from 'express';
import { GetTenantsUseCase } from '../../../application/use-cases/GetTenantsUseCase';
import { GetPlatformActivityUseCase } from '../../../application/use-cases/GetPlatformActivityUseCase';
import { GetGlobalMrrUseCase } from '../../../application/use-cases/GetGlobalMrrUseCase';
import { GetSystemHealthUseCase } from '../../../application/use-cases/GetSystemHealthUseCase';
import { GetSystemMetricsUseCase } from '../../../application/use-cases/GetSystemMetricsUseCase';
import { CreateTenantWithOwnerUseCase } from '../../../application/use-cases/CreateTenantWithOwnerUseCase';
import { SetTenantSubscriptionStatusUseCase } from '../../../application/use-cases/SetTenantSubscriptionStatusUseCase';
import { EnterTenantUseCase } from '../../../application/use-cases/EnterTenantUseCase';
import { DeleteTenantUseCase } from '../../../application/use-cases/DeleteTenantUseCase';
import { Tenant } from '../../../domain/entities/Tenant';
import {
  TenantNotFoundError,
  TenantSuspendedError,
  ConfirmationMismatchError,
} from '../../../domain/errors';
import { CreateUserUseCase } from '../../../../auth/application/use-cases/CreateUserUseCase';
import { GetPlatformUsersUseCase } from '../../../../auth/application/use-cases/GetPlatformUsersUseCase';
import { PlatformInviteUserUseCase } from '../../../../auth/application/use-cases/PlatformInviteUserUseCase';
import { GetOwnershipTransferCandidatesUseCase } from '../../../../auth/application/use-cases/GetOwnershipTransferCandidatesUseCase';
import { PlatformSuspendUserUseCase } from '../../../../auth/application/use-cases/PlatformSuspendUserUseCase';
import { PlatformReactivateUserUseCase } from '../../../../auth/application/use-cases/PlatformReactivateUserUseCase';
import { PlatformDeleteUserUseCase } from '../../../../auth/application/use-cases/PlatformDeleteUserUseCase';
import { CreatePlatformAdminUseCase } from '../../../../auth/application/use-cases/CreatePlatformAdminUseCase';
import { DeletePlatformAdminSelfUseCase } from '../../../../auth/application/use-cases/DeletePlatformAdminSelfUseCase';
import { User } from '../../../../auth/domain/entities/User';
import { BulkUpdateTenantSettingsUseCase } from '../../../../settings/application/use-cases/BulkUpdateTenantSettingsUseCase';
import { bulkUpdateTenantSettingsSchema } from '../../../../settings/interfaces/http/schemas/platformSettingsSchemas';
import {
  authCookieOptions,
  AUTH_COOKIE_MAX_AGE_MS,
} from '../../../../main/interfaces/http/authCookie';
import {
  SlugAlreadyTakenError,
  UnauthorizedError,
  UserNotFoundError,
  CannotModifySuperAdminError,
  OwnershipTransferRequiredError,
  InvalidOwnershipTargetError,
  RestoreOwnershipChoiceRequiredError,
  UserAlreadyInWorkspaceError,
  InvitationAlreadyPendingError,
  LastPlatformAdminError,
  EmailAlreadyInUseError,
} from '../../../../auth/domain/errors';
import { authenticate } from '../../../../main/interfaces/http/middlewares/authenticate';
import { authorize } from '../../../../main/interfaces/http/middlewares/authorize';
import { validateRequest } from '../../../../main/interfaces/http/middlewares/validateRequest';
import { tenantSchemas } from '../schemas/tenantSchemas';
import { UserRole } from '../../../../auth/domain/enums/UserRole';
import { ITokenService } from '../../../../auth/application/ports/ITokenService';
import { IEmailSender } from '../../../../auth/application/ports/IEmailSender';
import { IAuditLogger } from '../../../../shared/application/ports/IAuditLogger';

/**
 * The shape every tenant endpoint returns.
 *
 * One projection function rather than a hand-written object literal per route,
 * for the same reason `PrismaTenantRepository.toDomain` exists: three routes
 * each spelling out their own field list is how one of them ends up quietly
 * omitting `subscriptionStatus` and the console renders a suspended tenant as
 * active.
 */
const toResponse = (t: Tenant) => ({
  id: t.id,
  name: t.name,
  urlSlug: t.urlSlug,
  subscriptionStatus: t.subscriptionStatus,
  createdAt: t.createdAt,
});

/** Mirrors `toResponse` above, for the user-lifecycle endpoints. */
const toUserResponse = (u: User) => ({
  id: u.id,
  email: u.email,
  firstName: u.firstName,
  lastName: u.lastName,
  role: u.role,
  isActive: u.isActive,
  tenantId: u.tenantId,
  createdAt: u.createdAt,
});

export interface TenantRouterDeps {
  getTenantsUseCase: GetTenantsUseCase;
  getPlatformActivityUseCase: GetPlatformActivityUseCase;
  getGlobalMrrUseCase: GetGlobalMrrUseCase;
  getSystemHealthUseCase: GetSystemHealthUseCase;
  getSystemMetricsUseCase: GetSystemMetricsUseCase;
  createTenantWithOwnerUseCase: CreateTenantWithOwnerUseCase;
  suspendTenantUseCase: SetTenantSubscriptionStatusUseCase;
  reactivateTenantUseCase: SetTenantSubscriptionStatusUseCase;
  enterTenantUseCase: EnterTenantUseCase;
  deleteTenantUseCase: DeleteTenantUseCase;
  createUserUseCase: CreateUserUseCase;
  inviteUserUseCase: PlatformInviteUserUseCase;
  getPlatformUsersUseCase: GetPlatformUsersUseCase;
  getOwnershipTransferCandidatesUseCase: GetOwnershipTransferCandidatesUseCase;
  suspendUserUseCase: PlatformSuspendUserUseCase;
  reactivateUserUseCase: PlatformReactivateUserUseCase;
  deleteUserUseCase: PlatformDeleteUserUseCase;
  createPlatformAdminUseCase: CreatePlatformAdminUseCase;
  deletePlatformAdminSelfUseCase: DeletePlatformAdminSelfUseCase;
  bulkUpdateTenantSettingsUseCase: BulkUpdateTenantSettingsUseCase;
  tokenService: ITokenService;
  emailSender: IEmailSender;
  auditLogger: IAuditLogger;
}

export function createTenantRouter(deps: TenantRouterDeps): Router {
  const {
    getTenantsUseCase,
    getPlatformActivityUseCase,
    getGlobalMrrUseCase,
    getSystemHealthUseCase,
    getSystemMetricsUseCase,
    createTenantWithOwnerUseCase,
    suspendTenantUseCase,
    reactivateTenantUseCase,
    enterTenantUseCase,
    deleteTenantUseCase,
    createUserUseCase,
    inviteUserUseCase,
    getPlatformUsersUseCase,
    getOwnershipTransferCandidatesUseCase,
    suspendUserUseCase,
    reactivateUserUseCase,
    deleteUserUseCase,
    createPlatformAdminUseCase,
    deletePlatformAdminSelfUseCase,
    bulkUpdateTenantSettingsUseCase,
    tokenService,
    emailSender,
    auditLogger,
  } = deps;

  const router = Router();

  /*
   * Every route here is platform-level: SUPER_ADMIN administering the tenants
   * themselves, never a business's own data. That is why this router is mounted
   * at /api/tenants with no :tenantSlug prefix, and therefore why `resolveTenant`
   * never runs on it — there is no tenant context to resolve and no cross-tenant
   * surface to guard. `authenticate` + `authorize([SUPER_ADMIN])` is the whole
   * access control, applied uniformly at the router level so a route added later
   * cannot be left unguarded by omission.
   */
  router.use(authenticate(tokenService), authorize([UserRole.SUPER_ADMIN]));

  /**
   * Every handler needs the caller's role, and each one checked `req.user`
   * itself before. Both middlewares above guarantee it, so this is unreachable
   * in practice — but it is checked rather than asserted away, so a future
   * remount without `authenticate` fails closed with a 401 instead of passing
   * `undefined` in as the caller's role.
   */
  const callerRoleOf = (req: Request): string | null => req.user?.role ?? null;

  // SUPER_ADMIN only: list all tenants, suspended ones included.
  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const callerRole = callerRoleOf(req);
      if (!callerRole) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
      }
      const skip = req.query.skip ? parseInt(req.query.skip as string, 10) : undefined;
      const take = req.query.take ? parseInt(req.query.take as string, 10) : undefined;

      const result = await getTenantsUseCase.execute({ callerRole, skip, take });

      res.json({
        items: result.items.map(toResponse),
        total: result.total,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * SUPER_ADMIN only: provision a workspace and its first Business Owner.
   *
   * This runs the same `CreateTenantWithOwnerUseCase` as public
   * self-registration — two parallel paths onto one implementation, not a
   * replacement for the public flow.
   */
  router.post(
    '/',
    validateRequest(tenantSchemas.createTenant),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const callerRole = callerRoleOf(req);
        if (!callerRole || !req.user) {
          return res.status(401).json({ error: 'Access denied. No token provided.' });
        }

        // req.body is the *parsed* value: validateRequest replaces it with the
        // schema output, so undeclared keys cannot reach the use case. TD-011.
        const { tenant, user } = await createTenantWithOwnerUseCase.execute({
          companyName: req.body.companyName,
          urlSlug: req.body.urlSlug,
          ownerEmail: req.body.ownerEmail,
          ownerPassword: req.body.ownerPassword,
        });

        res.status(201).json({
          tenant: toResponse(tenant),
          // The owner's password is never echoed back, not even the hash.
          owner: { id: user.id, email: user.email, role: user.role },
        });

        // Awaited, unlike the email send below: an audit trail with a hole in
        // it defeats its own purpose (see IAuditLogger), so this must not be
        // best-effort. It runs after the response because a slow write here
        // must not delay the response, and the provisioning itself is already
        // committed regardless of whether this record succeeds.
        auditLogger
          .record({
            actorUserId: req.user.userId,
            actorRole: callerRole,
            action: 'TENANT_CREATED',
            targetType: 'TENANT',
            targetId: tenant.id,
            tenantId: tenant.id,
            metadata: { companyName: tenant.name, urlSlug: tenant.urlSlug, ownerEmail: user.email },
          })
          .catch((error) => {
            console.error('Failed to record TENANT_CREATED audit log', error);
          });

        // Best-effort, after the response is already sent: the owner's only
        // record of their password is this email, but a slow or failing mail
        // provider must not turn a successful provisioning into a failed
        // request or an inconsistent tenant.
        emailSender
          .sendWorkspaceCreatedEmail(user.email, {
            companyName: tenant.name,
            urlSlug: tenant.urlSlug,
            ownerPassword: req.body.ownerPassword,
          })
          .catch((error) => {
            console.error('Failed to send workspace-created email', error);
          });
      } catch (error) {
        if (error instanceof SlugAlreadyTakenError) {
          return res.status(409).json({ error: error.message });
        }
        next(error);
      }
    }
  );

  /*
   * Suspend and reactivate are PATCH on a sub-path rather than a single
   * PATCH /:id taking a status in the body. The two are distinct administrative
   * acts with different consequences, and a body-driven version makes
   * "reactivate everything" a one-character typo away from "suspend
   * everything".
   *
   * Both are idempotent: re-suspending a suspended tenant returns 200 with the
   * unchanged tenant, not an error. See SetTenantSubscriptionStatusUseCase.
   */
  const statusHandler =
    (useCase: SetTenantSubscriptionStatusUseCase) =>
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const callerRole = callerRoleOf(req);
        if (!callerRole) {
          return res.status(401).json({ error: 'Access denied. No token provided.' });
        }

        const tenant = await useCase.execute({
          callerRole,
          callerId: req.user?.userId,
          tenantId: String(req.params.id),
        });
        res.json({ tenant: toResponse(tenant) });
      } catch (error) {
        if (error instanceof TenantNotFoundError) {
          return res.status(404).json({ error: 'Tenant not found' });
        }
        if (error instanceof UnauthorizedError) {
          return res.status(403).json({ error: error.message });
        }
        next(error);
      }
    };

  router.patch('/:id/suspend', statusHandler(suspendTenantUseCase));
  router.patch('/:id/reactivate', statusHandler(reactivateTenantUseCase));

  /**
   * SUPER_ADMIN only: recent platform-wide administrative events, for the
   * dashboard's Platform Activity feed. Registered before `/:id/...` for the
   * same route-ordering reason `/users` below is.
   */
  router.get('/activity', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const callerRole = callerRoleOf(req);
      if (!callerRole) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
      }

      const take = req.query.take ? parseInt(req.query.take as string, 10) : undefined;
      const items = await getPlatformActivityUseCase.execute({ callerRole, take });

      res.json({ items });
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return res.status(403).json({ error: error.message });
      }
      next(error);
    }
  });

  /**
   * SUPER_ADMIN only: platform-wide Monthly Recurring Revenue, for the
   * dashboard's Global MRR card. Registered before `/:id/...` for the same
   * route-ordering reason `/activity` above is.
   */
  router.get('/mrr', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const callerRole = callerRoleOf(req);
      if (!callerRole) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
      }

      const mrr = await getGlobalMrrUseCase.execute({ callerRole });
      res.json(mrr);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return res.status(403).json({ error: error.message });
      }
      next(error);
    }
  });

  /**
   * SUPER_ADMIN only: platform system health, for the dashboard's System
   * Health card. Registered before `/:id/...` for the same route-ordering
   * reason `/activity` above is.
   */
  router.get('/health', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const callerRole = callerRoleOf(req);
      if (!callerRole) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
      }

      const health = await getSystemHealthUseCase.execute({ callerRole });
      res.json(health);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return res.status(403).json({ error: error.message });
      }
      next(error);
    }
  });

  /**
   * SUPER_ADMIN only: live request latency and traffic, for the dashboard's
   * Global Latency / Active Requests / Real-time Traffic panel. Registered
   * before `/:id/...` for the same route-ordering reason `/activity` above is.
   */
  router.get('/metrics', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const callerRole = callerRoleOf(req);
      if (!callerRole) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
      }

      const metrics = await getSystemMetricsUseCase.execute({ callerRole });
      res.json(metrics);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return res.status(403).json({ error: error.message });
      }
      next(error);
    }
  });

  /**
   * SUPER_ADMIN only: every account on the platform, across all workspaces.
   *
   * Registered BEFORE the `/:id/...` routes below. Express matches in
   * declaration order, so with the opposite order a GET of this path would be
   * fine but the router would grow increasingly fragile as `/:id` siblings are
   * added — declaring the literal first removes the question.
   */
  router.get('/users', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const callerRole = callerRoleOf(req);
      if (!callerRole) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
      }

      const result = await getPlatformUsersUseCase.execute({
        callerRole,
        tenantId: req.query.tenantId ? String(req.query.tenantId) : undefined,
        role: req.query.role ? String(req.query.role) : undefined,
        // Three states, not two: absent means "any", and only the literal
        // strings flip the filter. `Boolean(req.query.isActive)` would have made
        // "false" truthy and silently hidden every deactivated account.
        isActive:
          req.query.isActive === undefined
            ? undefined
            : String(req.query.isActive) === 'true',
        q: req.query.q ? String(req.query.q) : undefined,
        skip: req.query.skip ? parseInt(String(req.query.skip), 10) : undefined,
        take: req.query.take ? parseInt(String(req.query.take), 10) : undefined,
      });

      res.json(result);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return res.status(403).json({ error: error.message });
      }
      next(error);
    }
  });

  /**
   * Shared error mapping for the four user-lifecycle endpoints below. A `code`
   * accompanies the two 409s specifically so the console can tell "needs an
   * ownership-transfer target" and "needs a restore/keep choice" apart from a
   * generic conflict and open the right follow-up UI, rather than just
   * showing the message.
   */
  const handleUserLifecycleError = (error: unknown, res: Response, next: NextFunction) => {
    if (error instanceof UserNotFoundError) {
      return res.status(404).json({ error: error.message });
    }
    if (error instanceof CannotModifySuperAdminError) {
      return res.status(403).json({ error: error.message });
    }
    if (error instanceof ConfirmationMismatchError) {
      return res.status(400).json({ error: error.message });
    }
    if (error instanceof InvalidOwnershipTargetError) {
      return res.status(400).json({ error: error.message });
    }
    if (error instanceof OwnershipTransferRequiredError) {
      return res.status(409).json({ error: error.message, code: 'OWNERSHIP_TRANSFER_REQUIRED' });
    }
    if (error instanceof RestoreOwnershipChoiceRequiredError) {
      return res.status(409).json({ error: error.message, code: 'RESTORE_CHOICE_REQUIRED' });
    }
    // Carries a `code` for the same reason the two above do: the console
    // disables its own "close account" control on this condition, and matching
    // on a message string would break the moment the wording changes.
    if (error instanceof LastPlatformAdminError) {
      return res.status(409).json({ error: error.message, code: 'LAST_PLATFORM_ADMIN' });
    }
    if (error instanceof EmailAlreadyInUseError) {
      return res.status(409).json({ error: error.message, code: 'EMAIL_IN_USE' });
    }
    if (error instanceof UnauthorizedError) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  };

  /**
   * SUPER_ADMIN only: appoint another platform administrator.
   *
   * Separate from `POST /:id/users` because that route creates an account
   * INSIDE a workspace, and a platform admin belongs to none — there is no
   * `:id` to address this to. `CreateUserUseCase` still refuses the
   * SUPER_ADMIN role outright, so this endpoint is the single way the role is
   * ever granted through the API, and only an existing holder can reach it.
   *
   * Declared before the `/:id/...` routes below for the same ordering reason
   * `/users` is.
   */
  router.post(
    '/platform-admins',
    validateRequest(tenantSchemas.createPlatformAdmin),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const callerRole = callerRoleOf(req);
        if (!callerRole || !req.user) {
          return res.status(401).json({ error: 'Access denied. No token provided.' });
        }

        const user = await createPlatformAdminUseCase.execute({
          callerRole,
          callerId: req.user.userId,
          email: req.body.email,
          password: req.body.password,
          firstName: req.body.firstName,
          lastName: req.body.lastName,
        });

        // `{ user }`, matching POST /:id/users — the console's create paths
        // should not need to remember which one unwraps and which does not.
        res.status(201).json({ user });
      } catch (error) {
        handleUserLifecycleError(error, res, next);
      }
    }
  );

  /**
   * SUPER_ADMIN only: close YOUR OWN platform account.
   *
   * `/me` rather than an id, because the target is structurally the caller —
   * see `DeletePlatformAdminSelfUseCase`. Refused with 409
   * `LAST_PLATFORM_ADMIN` when no other admin would remain.
   *
   * The auth cookie is cleared on success: the account behind the caller's
   * token no longer exists, and a token that outlives its account for the
   * remainder of its hour (TD-010) is exactly the window worth closing here.
   */
  router.delete(
    '/platform-admins/me',
    validateRequest(tenantSchemas.deleteOwnPlatformAdmin),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const callerRole = callerRoleOf(req);
        if (!callerRole || !req.user) {
          return res.status(401).json({ error: 'Access denied. No token provided.' });
        }

        await deletePlatformAdminSelfUseCase.execute({
          callerRole,
          callerId: req.user.userId,
          confirmEmail: req.body.confirmEmail,
        });

        res.clearCookie('jwt', authCookieOptions());
        res.status(204).send();
      } catch (error) {
        handleUserLifecycleError(error, res, next);
      }
    }
  );

  /**
   * SUPER_ADMIN only: active staff eligible to become the new Business Owner
   * of `:id`'s workspace. Powers the ownership-transfer picker the console
   * shows before suspending or deleting a Business Owner who has a team.
   *
   * Registered before `/:id/...` for the same route-ordering reason `/users`
   * above is.
   */
  router.get(
    '/users/:id/ownership-transfer-candidates',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const callerRole = callerRoleOf(req);
        if (!callerRole) {
          return res.status(401).json({ error: 'Access denied. No token provided.' });
        }

        const candidates = await getOwnershipTransferCandidatesUseCase.execute({
          callerRole,
          userId: String(req.params.id),
        });

        res.json({ items: candidates.map(toUserResponse) });
      } catch (error) {
        handleUserLifecycleError(error, res, next);
      }
    }
  );

  /**
   * SUPER_ADMIN only: suspend any platform user. `newOwnerId` is required
   * only when the target is a Business Owner with other active staff — see
   * `PlatformSuspendUserUseCase`.
   */
  router.patch(
    '/users/:id/suspend',
    validateRequest(tenantSchemas.suspendUser),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const callerRole = callerRoleOf(req);
        if (!callerRole || !req.user) {
          return res.status(401).json({ error: 'Access denied. No token provided.' });
        }

        const { user } = await suspendUserUseCase.execute({
          callerRole,
          callerId: req.user.userId,
          userId: String(req.params.id),
          newOwnerId: req.body.newOwnerId,
        });

        res.json({ user: toUserResponse(user) });
      } catch (error) {
        handleUserLifecycleError(error, res, next);
      }
    }
  );

  /**
   * SUPER_ADMIN only: reactivate any platform user. `ownershipResolution` is
   * required only when the target has an unresolved ownership transfer from
   * their suspension, and picks between restoring them, keeping the stand-in,
   * or keeping BOTH as Business Owners — see `PlatformReactivateUserUseCase`.
   */
  router.patch(
    '/users/:id/reactivate',
    validateRequest(tenantSchemas.reactivateUser),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const callerRole = callerRoleOf(req);
        if (!callerRole || !req.user) {
          return res.status(401).json({ error: 'Access denied. No token provided.' });
        }

        const { user } = await reactivateUserUseCase.execute({
          callerRole,
          callerId: req.user.userId,
          userId: String(req.params.id),
          ownershipResolution: req.body.ownershipResolution,
        });

        res.json({ user: toUserResponse(user) });
      } catch (error) {
        handleUserLifecycleError(error, res, next);
      }
    }
  );

  /**
   * SUPER_ADMIN only: permanently delete a platform user (soft-delete —
   * see `PlatformDeleteUserUseCase`). `confirmEmail` must equal the target's
   * own current email, and `newOwnerId` is required only when the target is
   * a Business Owner with other active staff.
   */
  router.delete(
    '/users/:id',
    validateRequest(tenantSchemas.deleteUser),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const callerRole = callerRoleOf(req);
        if (!callerRole || !req.user) {
          return res.status(401).json({ error: 'Access denied. No token provided.' });
        }

        await deleteUserUseCase.execute({
          callerRole,
          callerId: req.user.userId,
          userId: String(req.params.id),
          confirmEmail: req.body.confirmEmail,
          newOwnerId: req.body.newOwnerId,
        });

        res.status(204).send();
      } catch (error) {
        handleUserLifecycleError(error, res, next);
      }
    }
  );

  /**
   * SUPER_ADMIN only: apply the same settings to several workspaces at once.
   *
   * Registered before `/:id/...` for the same reason `/users` above is: a
   * static segment declared after a `/:id` sibling is a latent bug waiting for
   * that sibling to be added.
   *
   * Writes directly onto each selected tenant's OWN settings — indistinguishable
   * from that workspace's Business Owner making the same change, just done to
   * several at once. This is NOT the platform-wide default below: it never
   * touches a tenant that was not explicitly selected, and it has no future
   * effect on a tenant created afterward.
   */
  router.put(
    '/bulk-settings',
    validateRequest(bulkUpdateTenantSettingsSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const callerRole = callerRoleOf(req);
        if (!callerRole) {
          return res.status(401).json({ error: 'Access denied. No token provided.' });
        }

        const result = await bulkUpdateTenantSettingsUseCase.execute({
          callerRole,
          tenantIds: req.body.tenantIds,
          settings: req.body.settings,
        });

        res.json(result);
      } catch (error) {
        if (error instanceof UnauthorizedError) {
          return res.status(403).json({ error: error.message });
        }
        next(error);
      }
    }
  );

  /**
   * SUPER_ADMIN only: create a user directly inside a workspace, credentials
   * included, without entering that workspace first.
   *
   * The in-workspace equivalent is POST /api/:tenantSlug/auth/users, which a
   * BUSINESS_OWNER uses for their own staff. Both run `CreateUserUseCase`, which
   * is where the "who may create which role, where" rules actually live.
   */
  router.post(
    '/:id/users',
    validateRequest(tenantSchemas.createUser),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const callerRole = callerRoleOf(req);
        if (!callerRole) {
          return res.status(401).json({ error: 'Access denied. No token provided.' });
        }

        const user = await createUserUseCase.execute({
          callerRole,
          callerTenantId: req.user!.tenantId,
          tenantId: String(req.params.id),
          email: req.body.email,
          password: req.body.password,
          firstName: req.body.firstName,
          lastName: req.body.lastName,
          phone: req.body.phone,
          role: req.body.role,
          warehouseId: req.body.warehouseId,
        });

        res.status(201).json({ user });
      } catch (error) {
        if (error instanceof UnauthorizedError) {
          return res.status(403).json({ error: error.message });
        }
        next(error);
      }
    }
  );

  /**
   * SUPER_ADMIN only: invite someone into a workspace by email, defaulting to
   * BUSINESS_OWNER.
   *
   * The third of the three ways a person becomes a Business Owner, and the
   * only one that starts outside the platform without the admin choosing the
   * password: promotion from staff (PUT /api/:tenantSlug/auth/staff/:id) and
   * an invitation from an existing owner (POST /api/:tenantSlug/auth/invitations)
   * are the other two. The recipient accepts through the same public
   * POST /api/auth/invitations/accept as any other invitee — no separate
   * acceptance path to keep in step.
   *
   * Adds an owner; never replaces one. A workspace may have several.
   */
  router.post(
    '/:id/invitations',
    validateRequest(tenantSchemas.inviteUser),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const callerRole = callerRoleOf(req);
        if (!callerRole || !req.user) {
          return res.status(401).json({ error: 'Access denied. No token provided.' });
        }

        const invitation = await inviteUserUseCase.execute({
          callerRole,
          callerId: req.user.userId,
          tenantId: String(req.params.id),
          email: req.body.email,
          role: req.body.role,
        });

        // The token is deliberately not echoed: the invitation email carries
        // it, and a link that grants account creation does not belong in an
        // API response body or the logs that collect one.
        res.status(201).json({ invitation: { email: invitation.email, role: invitation.role } });
      } catch (error) {
        if (error instanceof TenantNotFoundError) {
          return res.status(404).json({ error: 'Tenant not found' });
        }
        if (error instanceof UserAlreadyInWorkspaceError) {
          return res.status(409).json({ error: error.message, code: 'USER_ALREADY_IN_WORKSPACE' });
        }
        if (error instanceof InvitationAlreadyPendingError) {
          return res.status(409).json({ error: error.message, code: 'INVITATION_ALREADY_PENDING' });
        }
        if (error instanceof UnauthorizedError) {
          return res.status(403).json({ error: error.message });
        }
        next(error);
      }
    }
  );

  /**
   * SUPER_ADMIN only: enter a workspace and administer it as its owner.
   *
   * Replaces the browser's platform session with a workspace-scoped one — see
   * EnterTenantUseCase for why this is a session swap rather than an exemption
   * inside `resolveTenant`. The cookie is set through the shared
   * `authCookieOptions()` so it matches login's exactly; a hand-rolled option
   * set here would work locally and silently fail cross-site in production.
   */
  router.post('/:id/enter', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const callerRole = callerRoleOf(req);
      if (!callerRole) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
      }

      const result = await enterTenantUseCase.execute({
        callerUserId: req.user!.userId,
        callerRole,
        tenantId: String(req.params.id),
      });

      res.cookie('jwt', result.token, {
        ...authCookieOptions(),
        maxAge: AUTH_COOKIE_MAX_AGE_MS,
      });
      res.json({ tenantSlug: result.tenantSlug, tenantName: result.tenantName });
    } catch (error) {
      if (error instanceof TenantNotFoundError) {
        return res.status(404).json({ error: 'Tenant not found' });
      }
      if (error instanceof TenantSuspendedError) {
        return res.status(403).json({ error: error.message, code: 'TENANT_SUSPENDED' });
      }
      if (error instanceof UnauthorizedError) {
        return res.status(403).json({ error: error.message });
      }
      next(error);
    }
  });

  /**
   * SUPER_ADMIN only: permanently delete a workspace.
   *
   * Irreversible, unlike suspend/reactivate above — every row belonging to
   * the tenant and every file it stored on disk is gone once this returns.
   * `confirmSlug` in the body must equal the workspace's own `urlSlug`,
   * enforced in `DeleteTenantUseCase` against the real record so a stale or
   * copy-pasted-wrong slug in the client cannot slip through.
   */
  router.delete(
    '/:id',
    validateRequest(tenantSchemas.deleteTenant),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const callerRole = callerRoleOf(req);
        if (!callerRole || !req.user) {
          return res.status(401).json({ error: 'Access denied. No token provided.' });
        }

        await deleteTenantUseCase.execute({
          callerRole,
          callerId: req.user.userId,
          tenantId: String(req.params.id),
          confirmSlug: req.body.confirmSlug,
        });

        res.status(204).send();
      } catch (error) {
        if (error instanceof TenantNotFoundError) {
          return res.status(404).json({ error: 'Tenant not found' });
        }
        if (error instanceof ConfirmationMismatchError) {
          return res.status(400).json({ error: error.message });
        }
        if (error instanceof UnauthorizedError) {
          return res.status(403).json({ error: error.message });
        }
        next(error);
      }
    }
  );

  return router;
}
