import { Router } from 'express';
import { ITokenService } from '../../../auth/application/ports/ITokenService';
import { ITenantRepository } from '../../../tenant/domain/repositories/ITenantRepository';
import { ContractsController } from './ContractsController';
import { authenticate } from '../../../main/interfaces/http/middlewares/authenticate';
import { resolveTenant } from '../../../main/interfaces/http/middlewares/resolveTenant';

export const createContractRouter = (
  contractsController: ContractsController,
  tokenService: ITokenService,
  tenantRepository: ITenantRepository
) => {
  const router = Router({ mergeParams: true });

  // Same guard chain as every other tenant-scoped router: authenticate first,
  // then confirm the caller actually belongs to the tenant in the URL.
  router.use(authenticate(tokenService));
  router.use(resolveTenant(tenantRepository));

  router.use('/', contractsController.router);

  return router;
};
