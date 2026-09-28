import { Router } from 'express';
import { ITokenService } from '../../../auth/application/ports/ITokenService';
import { ITenantRepository } from '../../../tenant/domain/repositories/ITenantRepository';
import { MediaController } from './MediaController';
import { authenticate } from '../../../main/interfaces/http/middlewares/authenticate';
import { resolveTenant } from '../../../main/interfaces/http/middlewares/resolveTenant';
import { loadAccess } from '../../../main/interfaces/http/middlewares/loadAccess';
import { ResolveAccessContextUseCase } from '../../../access/application/use-cases/ResolveAccessContextUseCase';

export const createMediaRouter = (
  mediaController: MediaController,
  tokenService: ITokenService,
  tenantRepository: ITenantRepository,
  resolveAccessContext: ResolveAccessContextUseCase
) => {
  const router = Router({ mergeParams: true });

  // Same guard chain as every other tenant-scoped router: authenticate first,
  // then confirm the caller actually belongs to the tenant in the URL.
  router.use(authenticate(tokenService));
  router.use(resolveTenant(tenantRepository));
  // MediaController.authorize() still does its own per-kind check (user-owned
  // vs tenant-owned media); loadAccess only makes req.access available.
  router.use(loadAccess(resolveAccessContext));

  router.use('/', mediaController.router);

  return router;
};
