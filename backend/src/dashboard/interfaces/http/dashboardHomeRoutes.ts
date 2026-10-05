import { Router } from 'express';
import { authenticate } from '../../../main/interfaces/http/middlewares/authenticate';
import { resolveTenant } from '../../../main/interfaces/http/middlewares/resolveTenant';
import { loadAccess } from '../../../main/interfaces/http/middlewares/loadAccess';
import { ResolveAccessContextUseCase } from '../../../access/application/use-cases/ResolveAccessContextUseCase';
import { ITokenService } from '../../../auth/application/ports/ITokenService';
import { ITenantRepository } from '../../../tenant/domain/repositories/ITenantRepository';
import { DashboardController } from './DashboardController';

/** The role dashboards (M3 Slice 13), under the same guard chain as the other screens. Other paths fall through to the metrics router. */
export const createRoleDashboardRouter = (
  controller: DashboardController,
  tokenService: ITokenService,
  tenantRepository: ITenantRepository,
  resolveAccessContext: ResolveAccessContextUseCase
) => {
  const router = Router({ mergeParams: true });
  router.use(['/home', '/sales-user', '/sales-manager'], authenticate(tokenService), resolveTenant(tenantRepository), loadAccess(resolveAccessContext));
  router.use('/', controller.router);
  return router;
};
