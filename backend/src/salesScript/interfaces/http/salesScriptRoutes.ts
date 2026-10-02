import { Router } from 'express';
import { ITokenService } from '../../../auth/application/ports/ITokenService';
import { ITenantRepository } from '../../../tenant/domain/repositories/ITenantRepository';
import { authenticate } from '../../../main/interfaces/http/middlewares/authenticate';
import { resolveTenant } from '../../../main/interfaces/http/middlewares/resolveTenant';
import { loadAccess } from '../../../main/interfaces/http/middlewares/loadAccess';
import { requirePermission } from '../../../main/interfaces/http/middlewares/requirePermission';
import { validateRequest } from '../../../main/interfaces/http/middlewares/validateRequest';
import { ResolveAccessContextUseCase } from '../../../access/application/use-cases/ResolveAccessContextUseCase';
import { EDIT_SCRIPT, VIEW_SCRIPT } from '../../application/salesScriptAccess';
import { SalesScriptController } from './SalesScriptController';
import { salesScriptSchemas } from './salesScriptSchemas';

/**
 * `/api/:tenantSlug/sales-script`. Salespeople read the published script
 * with `script.view`; everything else is the Administrator's `script.edit`,
 * so a salesperson calling an edit route gets 403 (FR-SCR-07).
 */
export const createSalesScriptRouter = (
  controller: SalesScriptController,
  tokenService: ITokenService,
  tenantRepository: ITenantRepository,
  resolveAccessContext: ResolveAccessContextUseCase
): Router => {
  const router = Router({ mergeParams: true });
  router.use(authenticate(tokenService));
  router.use(resolveTenant(tenantRepository));
  router.use(loadAccess(resolveAccessContext));

  const edit = requirePermission(EDIT_SCRIPT);
  router.get('/', requirePermission(VIEW_SCRIPT), controller.published);
  router.get('/draft', edit, controller.draft);
  router.put('/draft', edit, validateRequest(salesScriptSchemas.draft), controller.save);
  router.post('/publish', edit, controller.publish);
  router.get('/versions', edit, controller.versions);
  router.get('/versions/:version', edit, controller.version);
  router.post('/versions/:version/restore', edit, controller.restore);

  return router;
};
