import { Router } from 'express';
import { IntegrationsController } from './IntegrationsController';
import { ITokenService } from '../../../auth/application/ports/ITokenService';
import { ITenantRepository } from '../../../tenant/domain/repositories/ITenantRepository';
import { resolveTenant } from '../../../main/interfaces/http/middlewares/resolveTenant';
import { authenticate } from '../../../main/interfaces/http/middlewares/authenticate';
import { loadAccess } from '../../../main/interfaces/http/middlewares/loadAccess';
import { requirePermission } from '../../../main/interfaces/http/middlewares/requirePermission';
import { ResolveAccessContextUseCase } from '../../../access/application/use-cases/ResolveAccessContextUseCase';

export const createIntegrationRouter = (
  controller: IntegrationsController,
  tokenService: ITokenService,
  tenantRepository: ITenantRepository,
  resolveAccessContext: ResolveAccessContextUseCase
): Router => {
  const router = Router({ mergeParams: true });

  // Apply authentication, tenant resolution and permission checks to all routes
  router.use(authenticate(tokenService));
  router.use(resolveTenant(tenantRepository));
  router.use(loadAccess(resolveAccessContext));
  // integrations.manage (D8, Administrator only by default) — was BUSINESS_OWNER only.
  router.use(requirePermission('integrations.manage'));

  router.get('/', controller.getIntegrations);
  router.post('/connect', controller.connectIntegration);
  router.post('/disconnect', controller.disconnectIntegration);

  return router;
};
