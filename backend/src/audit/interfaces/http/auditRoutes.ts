import { Router } from 'express';
import { ITokenService } from '../../../auth/application/ports/ITokenService';
import { ITenantRepository } from '../../../tenant/domain/repositories/ITenantRepository';
import { authenticate } from '../../../main/interfaces/http/middlewares/authenticate';
import { resolveTenant } from '../../../main/interfaces/http/middlewares/resolveTenant';
import { loadAccess } from '../../../main/interfaces/http/middlewares/loadAccess';
import { requirePermission } from '../../../main/interfaces/http/middlewares/requirePermission';
import { ResolveAccessContextUseCase } from '../../../access/application/use-cases/ResolveAccessContextUseCase';
import { AuditController } from './AuditController';

/**
 * `/api/:tenantSlug/audit` — every route here is `audit.view` (Administrator
 * and CEO). Only `GET` routes exist, and there is no route at all for
 * `/:id` other than `GET`: an entry can be read but never changed
 * (FR-AUD-05). `export.csv` is registered before `/:id` so it is never
 * swallowed by the id route.
 */
export const createAuditRouter = (
  controller: AuditController,
  tokenService: ITokenService,
  tenantRepository: ITenantRepository,
  resolveAccessContext: ResolveAccessContextUseCase
): Router => {
  const router = Router({ mergeParams: true });
  router.use(authenticate(tokenService));
  router.use(resolveTenant(tenantRepository));
  router.use(loadAccess(resolveAccessContext));

  const view = requirePermission('audit.view');
  router.get('/', view, controller.search);
  router.get('/export.csv', view, controller.exportCsv);
  router.get('/:id', view, controller.get);

  return router;
};
