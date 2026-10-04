import { Router } from 'express';
import { ITokenService } from '../../../../auth/application/ports/ITokenService';
import { ITenantRepository } from '../../../../tenant/domain/repositories/ITenantRepository';
import { authenticate } from '../../../../main/interfaces/http/middlewares/authenticate';
import { resolveTenant } from '../../../../main/interfaces/http/middlewares/resolveTenant';
import { loadAccess } from '../../../../main/interfaces/http/middlewares/loadAccess';
import { requirePermission } from '../../../../main/interfaces/http/middlewares/requirePermission';
import { ResolveAccessContextUseCase } from '../../../../access/application/use-cases/ResolveAccessContextUseCase';
import { VIEW_CALENDAR } from '../../../application/followUps/followUpAccess';
import { CalendarController } from './CalendarController';

/**
 * `/api/:tenantSlug/calendar` (M2 Slice 12). Reading takes `calendar.view`,
 * scoped on the salesperson: the CEO reads everyone's and, holding neither
 * `activities.add` nor `followups.manage`, changes nothing (FR-CAL-06).
 */
export const createCalendarRouter = (
  controller: CalendarController,
  tokenService: ITokenService,
  tenantRepository: ITenantRepository,
  resolveAccessContext: ResolveAccessContextUseCase
): Router => {
  const router = Router({ mergeParams: true });
  router.use(authenticate(tokenService));
  router.use(resolveTenant(tenantRepository));
  router.use(loadAccess(resolveAccessContext));
  router.get('/', requirePermission(VIEW_CALENDAR), controller.feed);
  return router;
};
