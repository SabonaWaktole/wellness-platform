import { Router } from 'express';
import { ITokenService } from '../../../../auth/application/ports/ITokenService';
import { ITenantRepository } from '../../../../tenant/domain/repositories/ITenantRepository';
import { authenticate } from '../../../../main/interfaces/http/middlewares/authenticate';
import { resolveTenant } from '../../../../main/interfaces/http/middlewares/resolveTenant';
import { loadAccess } from '../../../../main/interfaces/http/middlewares/loadAccess';
import { requirePermission } from '../../../../main/interfaces/http/middlewares/requirePermission';
import { validateRequest } from '../../../../main/interfaces/http/middlewares/validateRequest';
import { ResolveAccessContextUseCase } from '../../../../access/application/use-cases/ResolveAccessContextUseCase';
import { EDIT_OFFERS, VIEW_COMMERCIAL } from '../../../application/offers/offerAccess';
import { OffersController } from './OffersController';
import { offerSchemas } from './offerSchemas';

/**
 * `/api/:tenantSlug/offers`. Reading the list and the PDF needs
 * `commercial.view`, and the status steps `offers.edit`, both scoped on the
 * deal's salesperson in the use cases; Reception holds neither and gets 403
 * everywhere (FR-RBAC-17). There is no email route: offers are sent by hand
 * and marked as sent (FR-OFR-07).
 */
export const createOfferRouter = (
  controller: OffersController,
  tokenService: ITokenService,
  tenantRepository: ITenantRepository,
  resolveAccessContext: ResolveAccessContextUseCase
): Router => {
  const router = Router({ mergeParams: true });
  router.use(authenticate(tokenService));
  router.use(resolveTenant(tenantRepository));
  router.use(loadAccess(resolveAccessContext));

  const view = requirePermission(VIEW_COMMERCIAL);
  const edit = requirePermission(EDIT_OFFERS);
  router.get('/', view, controller.list);
  router.get('/:id/pdf', view, controller.pdf);
  router.post('/:id/mark-ready', edit, validateRequest(offerSchemas.empty), controller.ready);
  router.post('/:id/mark-sent', edit, validateRequest(offerSchemas.markSent), controller.sent);
  router.post('/:id/mark-accepted', edit, validateRequest(offerSchemas.respond), controller.accepted);
  router.post('/:id/mark-rejected', edit, validateRequest(offerSchemas.respond), controller.rejected);
  router.post('/:id/revise', edit, validateRequest(offerSchemas.empty), controller.revised);

  return router;
};
