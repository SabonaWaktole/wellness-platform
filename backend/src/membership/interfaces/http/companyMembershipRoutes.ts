import { NextFunction, Request, Response, Router } from 'express';
import { requireTenant } from '@main/interfaces/http/tenantContext';
import { ITokenService } from '../../../auth/application/ports/ITokenService';
import { ITenantRepository } from '../../../tenant/domain/repositories/ITenantRepository';
import { authenticate } from '../../../main/interfaces/http/middlewares/authenticate';
import { resolveTenant } from '../../../main/interfaces/http/middlewares/resolveTenant';
import { loadAccess } from '../../../main/interfaces/http/middlewares/loadAccess';
import { requirePermission } from '../../../main/interfaces/http/middlewares/requirePermission';
import { ResolveAccessContextUseCase } from '../../../access/application/use-cases/ResolveAccessContextUseCase';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { redactMemberFields } from '../../../access/domain/redactFields';
import { MEMBERS_VIEW } from '../../application/membershipPermissions';
import { GetCompanyMembershipUseCase } from '../../application/use-cases/EmployerUseCases';

/**
 * `GET /api/:tenantSlug/clients/:id/membership` (M4 Slice 10, FR-MEM-11): the
 * data of the company page's Wellness+ tab, for "Members: view". It sits next to
 * the clients routes and answers only this one path; everything else falls
 * through to them.
 */
export const createCompanyMembershipRouter = (
  getCompanyMembership: GetCompanyMembershipUseCase,
  tokenService: ITokenService,
  tenantRepository: ITenantRepository,
  resolveAccessContext: ResolveAccessContextUseCase
): Router => {
  const router = Router({ mergeParams: true });

  router.get(
    '/:id/membership',
    authenticate(tokenService),
    resolveTenant(tenantRepository),
    loadAccess(resolveAccessContext),
    requirePermission(MEMBERS_VIEW),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenant = requireTenant(req);
        const data = await getCompanyMembership.execute({ access: req.access!, tenantId: tenant.id, timezone: tenant.timezone, clientId: String(req.params.id) });
        if (!data) return res.status(404).json({ error: 'Company not found', code: 'COMPANY_NOT_FOUND' });
        return res.json(redactMemberFields({ data }, req.access!));
      } catch (error) {
        if (error instanceof PermissionDeniedError) return res.status(403).json({ error: error.message });
        return next(error);
      }
    }
  );

  return router;
};
