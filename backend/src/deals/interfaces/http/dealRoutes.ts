import { Router } from 'express';
import { ITokenService } from '../../../auth/application/ports/ITokenService';
import { ITenantRepository } from '../../../tenant/domain/repositories/ITenantRepository';
import { authenticate } from '../../../main/interfaces/http/middlewares/authenticate';
import { resolveTenant } from '../../../main/interfaces/http/middlewares/resolveTenant';
import { loadAccess } from '../../../main/interfaces/http/middlewares/loadAccess';
import { requirePermission } from '../../../main/interfaces/http/middlewares/requirePermission';
import { validateRequest } from '../../../main/interfaces/http/middlewares/validateRequest';
import { ResolveAccessContextUseCase } from '../../../access/application/use-cases/ResolveAccessContextUseCase';
import { DELETE_DEALS, EDIT_DEALS, REASSIGN_DEALS, REOPEN_DEALS, VIEW_COMMERCIAL, VIEW_DEALS } from '../../application/dealAccess';
import { EDIT_OFFERS } from '../../../pricing/application/use-cases/ListActivePackagesUseCase';
import { DealController } from './DealController';
import { dealSchemas } from './dealSchemas';

/**
 * `/api/:tenantSlug/deals`. Reading needs `deals.view`, so Reception, which
 * holds no deals key, gets 403 on every route (FR-DEAL-04). Changing the
 * salesperson takes `companies.reassign` (FR-DEAL-05); deleting takes
 * `deals.delete` (FR-DEAL-19). Each use case narrows to the caller's scope.
 */
export const createDealRouter = (
  controller: DealController,
  tokenService: ITokenService,
  tenantRepository: ITenantRepository,
  resolveAccessContext: ResolveAccessContextUseCase
): Router => {
  const router = Router({ mergeParams: true });
  router.use(authenticate(tokenService));
  router.use(resolveTenant(tenantRepository));
  router.use(loadAccess(resolveAccessContext));

  const view = requirePermission(VIEW_DEALS);
  const edit = requirePermission(EDIT_DEALS);
  router.get('/', view, controller.list);
  router.get('/board', view, controller.board);
  router.get('/board/column', view, controller.column);
  router.get('/:id', view, controller.get);
  // FR-ACT-05: notes and other types are filtered by notes.view / activities.view in the use case.
  router.get('/:id/activities', view, controller.activities);
  // Slice 8: the deal's offers are commercial (FR-RBAC-17); the deal's own
  // deals.view scope is checked in the use case. Saving the pricing screen
  // creates or updates the deal's draft offer (FR-PRC-12).
  router.get('/:id/offers', requirePermission(VIEW_COMMERCIAL), controller.offers);
  router.put('/:id/offer', requirePermission(EDIT_OFFERS), validateRequest(dealSchemas.offer), controller.saveOffer);
  router.post('/', edit, validateRequest(dealSchemas.create), controller.create);
  router.patch('/:id', edit, validateRequest(dealSchemas.update), controller.update);
  router.post('/:id/stage', edit, validateRequest(dealSchemas.stage), controller.stage);
  // Slice 13: winning and losing need deals.edit, reopening deals.reopen (FR-DEAL-14, 16, 17).
  router.post('/:id/win', edit, validateRequest(dealSchemas.win), controller.win);
  router.post('/:id/lose', edit, validateRequest(dealSchemas.lose), controller.lose);
  router.post('/:id/reopen', requirePermission(REOPEN_DEALS), validateRequest(dealSchemas.reopen), controller.reopen);
  router.post('/:id/reassign', requirePermission(REASSIGN_DEALS), validateRequest(dealSchemas.reassign), controller.reassign);
  router.delete('/:id', requirePermission(DELETE_DEALS), controller.remove);

  return router;
};
