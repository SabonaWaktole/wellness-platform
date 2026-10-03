import { Router } from 'express';
import { ITokenService } from '../../../../auth/application/ports/ITokenService';
import { ITenantRepository } from '../../../../tenant/domain/repositories/ITenantRepository';
import { authenticate } from '../../../../main/interfaces/http/middlewares/authenticate';
import { resolveTenant } from '../../../../main/interfaces/http/middlewares/resolveTenant';
import { loadAccess } from '../../../../main/interfaces/http/middlewares/loadAccess';
import { requirePermission } from '../../../../main/interfaces/http/middlewares/requirePermission';
import { validateRequest } from '../../../../main/interfaces/http/middlewares/validateRequest';
import { ResolveAccessContextUseCase } from '../../../../access/application/use-cases/ResolveAccessContextUseCase';
import { APPROVE_DISCOUNTS, EDIT_OFFERS } from '../../../application/offers/offerAccess';
import { DiscountApprovalsController } from './DiscountApprovalsController';
import { discountApprovalSchemas } from './discountApprovalSchemas';

/**
 * `/api/:tenantSlug/discount-approvals` (M2 Slice 10, FR-DSC-06, 10).
 * Deciding needs `discounts.approve` in scope on the deal's salesperson;
 * withdrawing needs `offers.edit` (the requester, checked in the use case).
 * Outside the scope the answer is 404 from the use case, never 403, so a
 * link to someone else's request does not confirm it exists.
 */
export const createDiscountApprovalRouter = (
  controller: DiscountApprovalsController,
  tokenService: ITokenService,
  tenantRepository: ITenantRepository,
  resolveAccessContext: ResolveAccessContextUseCase
): Router => {
  const router = Router({ mergeParams: true });
  router.use(authenticate(tokenService));
  router.use(resolveTenant(tenantRepository));
  router.use(loadAccess(resolveAccessContext));

  const approve = requirePermission(APPROVE_DISCOUNTS);
  const edit = requirePermission(EDIT_OFFERS);
  router.get('/pending', approve, controller.pending);
  router.post('/:id/approve', approve, validateRequest(discountApprovalSchemas.approve), controller.approve);
  router.post('/:id/reject', approve, validateRequest(discountApprovalSchemas.reject), controller.reject);
  router.post('/:id/withdraw', edit, validateRequest(discountApprovalSchemas.empty), controller.withdraw);

  return router;
};
