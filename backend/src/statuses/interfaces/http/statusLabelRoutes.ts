import { Request, Response, Router } from 'express';
import { ITokenService } from '../../../auth/application/ports/ITokenService';
import { ITenantRepository } from '../../../tenant/domain/repositories/ITenantRepository';
import { authenticate } from '../../../main/interfaces/http/middlewares/authenticate';
import { resolveTenant } from '../../../main/interfaces/http/middlewares/resolveTenant';
import { loadAccess } from '../../../main/interfaces/http/middlewares/loadAccess';
import { requireAnyPermission } from '../../../main/interfaces/http/middlewares/requirePermission';
import { validateRequest } from '../../../main/interfaces/http/middlewares/validateRequest';
import { ResolveAccessContextUseCase } from '../../../access/application/use-cases/ResolveAccessContextUseCase';
import { isStatusDomain } from '../../domain/StatusCatalogue';
import { STATUS_EDIT_KEYS } from '../../application/statusAdmin';
import { StatusLabelsController } from './StatusLabelsController';
import { statusLabelSchemas } from './statusLabelSchemas';

/**
 * `/api/:tenantSlug/status-labels/:domain`. Reading is open to everyone in
 * the workspace, since every status badge needs it; every write is the
 * Administrator's `settings.manage` (FR-SET-07, 08), and for the deal stages
 * `activityResults.manage` as well (M2 Slice 6). The use case decides by
 * domain.
 */
export const createStatusLabelRouter = (
  controller: StatusLabelsController,
  tokenService: ITokenService,
  tenantRepository: ITenantRepository,
  resolveAccessContext: ResolveAccessContextUseCase
): Router => {
  const router = Router({ mergeParams: true });
  router.use(authenticate(tokenService));
  router.use(resolveTenant(tenantRepository));
  router.use(loadAccess(resolveAccessContext));

  router.param('domain', (req: Request, res: Response, next) => {
    if (!isStatusDomain((req.params.domain as string).toUpperCase())) {
      return res.status(404).json({ error: 'Unknown status domain.' });
    }
    next();
  });

  const manage = requireAnyPermission(STATUS_EDIT_KEYS);
  router.get('/:domain', controller.list);
  router.put('/:domain/order', manage, validateRequest(statusLabelSchemas.reorder), controller.reorder);
  router.patch('/:domain/:key', manage, validateRequest(statusLabelSchemas.update), controller.update);

  return router;
};
