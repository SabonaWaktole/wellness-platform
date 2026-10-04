import { Router } from 'express';
import { ITokenService } from '../../../../auth/application/ports/ITokenService';
import { ITenantRepository } from '../../../../tenant/domain/repositories/ITenantRepository';
import { authenticate } from '../../../../main/interfaces/http/middlewares/authenticate';
import { resolveTenant } from '../../../../main/interfaces/http/middlewares/resolveTenant';
import { loadAccess } from '../../../../main/interfaces/http/middlewares/loadAccess';
import { requirePermission } from '../../../../main/interfaces/http/middlewares/requirePermission';
import { validateRequest } from '../../../../main/interfaces/http/middlewares/validateRequest';
import { ResolveAccessContextUseCase } from '../../../../access/application/use-cases/ResolveAccessContextUseCase';
import { MANAGE_FOLLOW_UPS, VIEW_CALENDAR } from '../../../application/followUps/followUpAccess';
import { FollowUpController } from './FollowUpController';
import { followUpSchemas } from './followUpSchemas';

/**
 * `/api/:tenantSlug/follow-ups` (M2 Slice 11). Reading takes `calendar.view`
 * and every change `followups.manage`, so the CEO reads the team's and
 * changes nothing (FR-FUP-08), and Reception holds neither. Each use case
 * narrows to the caller's scope; reassigning also needs Team or wider.
 */
export const createFollowUpRouter = (
  controller: FollowUpController,
  tokenService: ITokenService,
  tenantRepository: ITenantRepository,
  resolveAccessContext: ResolveAccessContextUseCase
): Router => {
  const router = Router({ mergeParams: true });
  router.use(authenticate(tokenService));
  router.use(resolveTenant(tenantRepository));
  router.use(loadAccess(resolveAccessContext));

  const view = requirePermission(VIEW_CALENDAR);
  const manage = requirePermission(MANAGE_FOLLOW_UPS);

  router.get('/mine', view, controller.mine);
  router.get('/overdue-count', view, controller.overdueCount);
  router.get('/', view, controller.list);
  router.get('/:id', view, controller.get);
  router.post('/', manage, validateRequest(followUpSchemas.schedule), controller.schedule);
  router.post('/:id/complete', manage, validateRequest(followUpSchemas.complete), controller.complete);
  router.post('/:id/reschedule', manage, validateRequest(followUpSchemas.reschedule), controller.reschedule);
  router.post('/:id/cancel', manage, validateRequest(followUpSchemas.cancel), controller.cancel);
  router.post('/:id/reassign', manage, validateRequest(followUpSchemas.reassign), controller.reassign);
  return router;
};
