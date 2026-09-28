import { Router } from 'express';
import { ITokenService } from '../../../auth/application/ports/ITokenService';
import { ITenantRepository } from '../../../tenant/domain/repositories/ITenantRepository';
import { authenticate } from '../../../main/interfaces/http/middlewares/authenticate';
import { resolveTenant } from '../../../main/interfaces/http/middlewares/resolveTenant';
import { loadAccess } from '../../../main/interfaces/http/middlewares/loadAccess';
import { requirePermission } from '../../../main/interfaces/http/middlewares/requirePermission';
import { validateRequest } from '../../../main/interfaces/http/middlewares/validateRequest';
import { ResolveAccessContextUseCase } from '../../application/use-cases/ResolveAccessContextUseCase';
import { RolesController } from './RolesController';
import { roleSchemas } from './roleSchemas';

/** `/api/:tenantSlug/roles` — every route here is the Administrator's `roles.manage` (FR-RBAC-03). */
export const createRoleRouter = (
  controller: RolesController,
  tokenService: ITokenService,
  tenantRepository: ITenantRepository,
  resolveAccessContext: ResolveAccessContextUseCase
): Router => {
  const router = Router({ mergeParams: true });
  router.use(authenticate(tokenService));
  router.use(resolveTenant(tenantRepository));
  router.use(loadAccess(resolveAccessContext));

  const manage = requirePermission('roles.manage');
  router.get('/', manage, controller.list);
  router.put('/:id/permissions', manage, validateRequest(roleSchemas.updatePermissions), controller.update);
  router.post('/:id/copy', manage, validateRequest(roleSchemas.copyRole), controller.copy);
  router.patch('/:id', manage, validateRequest(roleSchemas.renameRole), controller.rename);
  router.delete('/:id', manage, controller.remove);

  return router;
};
