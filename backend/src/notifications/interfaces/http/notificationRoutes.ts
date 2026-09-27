import { Router } from 'express';
import { NotificationController } from './NotificationController';
import { ITokenService } from '../../../auth/application/ports/ITokenService';
import { ITenantRepository } from '../../../tenant/domain/repositories/ITenantRepository';
import { authenticate } from '../../../main/interfaces/http/middlewares/authenticate';
import { resolveTenant } from '../../../main/interfaces/http/middlewares/resolveTenant';
import { loadAccess } from '../../../main/interfaces/http/middlewares/loadAccess';
import { requirePermission } from '../../../main/interfaces/http/middlewares/requirePermission';
import { ResolveAccessContextUseCase } from '../../../access/application/use-cases/ResolveAccessContextUseCase';

/**
 * There is no `authorize(...)`/`requirePermission(...)` on most of these.
 *
 * That is deliberate, not an omission: every role has notifications, and the
 * authorisation that matters is per-row, not per-role. Each handler reads the
 * recipient from the token and each repository call filters by
 * `tenantId + recipientUserId`, so a caller can only ever reach their own
 * rows. A role gate here would add nothing and would wrongly imply that some
 * roles may read others' notifications.
 *
 * The one exception is writing the workspace notification *policy*
 * (`PUT /settings`, §6.6) — that is tenant configuration, not a personal row,
 * so it gates on `settings.manage` like every other admin setting.
 */
export const createNotificationRouter = (
  controller: NotificationController,
  tokenService: ITokenService,
  tenantRepository: ITenantRepository,
  resolveAccessContext: ResolveAccessContextUseCase
): Router => {
  const router = Router({ mergeParams: true });

  const authMw = authenticate(tokenService);
  const resolveTenantMw = resolveTenant(tenantRepository);

  router.use(authMw, resolveTenantMw, loadAccess(resolveAccessContext));

  router.get('/', controller.list);

  /*
   * The workspace policy (§6.6). Mounted here rather than under /settings
   * because it is the notifications module's own state — the settings module
   * owns the Tenant row, and splitting one feature's storage across two modules
   * to match one screen's layout would be organising the backend by URL.
   *
   * Before /:id/read for the same reason /read-all is: a literal path segment
   * must be matched before a parameterised one.
   */
  router.get('/settings', controller.readSettings);
  router.put('/settings', requirePermission('settings.manage'), controller.writeSettings);

  router.patch('/read-all', controller.markEverythingRead);
  // After /read-all, so the literal path is not swallowed by :id.
  router.patch('/:id/read', controller.markOneRead);

  return router;
};
