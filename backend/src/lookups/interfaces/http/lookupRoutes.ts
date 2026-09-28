import { NextFunction, Request, Response, Router } from 'express';
import { ITokenService } from '../../../auth/application/ports/ITokenService';
import { ITenantRepository } from '../../../tenant/domain/repositories/ITenantRepository';
import { authenticate } from '../../../main/interfaces/http/middlewares/authenticate';
import { resolveTenant } from '../../../main/interfaces/http/middlewares/resolveTenant';
import { loadAccess } from '../../../main/interfaces/http/middlewares/loadAccess';
import { requirePermission } from '../../../main/interfaces/http/middlewares/requirePermission';
import { validateRequest } from '../../../main/interfaces/http/middlewares/validateRequest';
import { ResolveAccessContextUseCase } from '../../../access/application/use-cases/ResolveAccessContextUseCase';
import { isLookupList, LookupList } from '../../domain/LookupList';
import { MANAGE_LISTS } from '../../application/lookupAdmin';
import { LookupsController } from './LookupsController';
import { lookupSchemas } from './lookupSchemas';

/** Validates the body against the schema of the list named in the URL. */
const validateFor = (schemaOf: (list: LookupList) => Parameters<typeof validateRequest>[0]) =>
  (req: Request, res: Response, next: NextFunction) => validateRequest(schemaOf(req.params.list as LookupList))(req, res, next);

/**
 * `/api/:tenantSlug/lookups/:list`. Reading the active values is open to
 * everyone in the workspace, since every company form needs them; every write
 * is the Administrator's `settings.manage` (FR-SET-01, 02).
 */
export const createLookupRouter = (
  controller: LookupsController,
  tokenService: ITokenService,
  tenantRepository: ITenantRepository,
  resolveAccessContext: ResolveAccessContextUseCase
): Router => {
  const router = Router({ mergeParams: true });
  router.use(authenticate(tokenService));
  router.use(resolveTenant(tenantRepository));
  router.use(loadAccess(resolveAccessContext));

  router.param('list', (req, res, next, list: string) => {
    if (!isLookupList(list)) {
      return res.status(404).json({ error: 'Unknown list.' });
    }
    next();
  });

  const manage = requirePermission(MANAGE_LISTS);
  router.get('/:list', controller.list);
  router.post('/:list', manage, validateFor(lookupSchemas.create), controller.create);
  router.put('/:list/order', manage, validateRequest(lookupSchemas.reorder), controller.reorder);
  router.patch('/:list/:id', manage, validateFor(lookupSchemas.update), controller.update);
  router.post('/:list/:id/deactivate', manage, validateRequest(lookupSchemas.deactivate), controller.deactivate);
  router.post('/:list/:id/reactivate', manage, controller.reactivate);
  router.delete('/:list/:id', manage, controller.remove);

  return router;
};
