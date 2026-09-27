import { Router, Request, Response, NextFunction } from 'express';
import { GetTenantClientMetricsUseCase } from '../../../application/use-cases/GetTenantClientMetricsUseCase';
import { GetTenantActivityFeedUseCase } from '../../../application/use-cases/GetTenantActivityFeedUseCase';
import { authenticate } from '../../../../main/interfaces/http/middlewares/authenticate';
import { loadAccess } from '../../../../main/interfaces/http/middlewares/loadAccess';
import { requirePermission } from '../../../../main/interfaces/http/middlewares/requirePermission';
import { resolveTenant } from '../../../../main/interfaces/http/middlewares/resolveTenant';
import { requireTenant, requireTenantId } from '../../../../main/interfaces/http/tenantContext';
import { ITokenService } from '../../../../auth/application/ports/ITokenService';
import { ITenantRepository } from '../../../../tenant/domain/repositories/ITenantRepository';
import { ResolveAccessContextUseCase } from '../../../../access/application/use-cases/ResolveAccessContextUseCase';

export function createDashboardRouter(
  metricsUseCase: GetTenantClientMetricsUseCase,
  feedUseCase: GetTenantActivityFeedUseCase,
  tokenService: ITokenService,
  tenantRepository: ITenantRepository,
  resolveAccessContext: ResolveAccessContextUseCase
): Router {
  const router = Router({ mergeParams: true }); // Important: to access :tenantSlug from parent router

  // Middleware chain for dashboard routes
  router.use(authenticate(tokenService));
  router.use(resolveTenant(tenantRepository));
  router.use(loadAccess(resolveAccessContext));

  // GET /api/:tenantSlug/dashboard/metrics
  router.get('/metrics',
    // companies.view: every one of the five roles holds it, same reach as
    // the old BUSINESS_OWNER + STAFF gate.
    requirePermission('companies.view'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        // The tenant is already resolved on the request by resolveTenant, so
        // its timezone comes along without an extra read.
        const result = await metricsUseCase.execute({
          tenantId: requireTenantId(req),
          timeZone: requireTenant(req).timezone,
          userId: req.user!.userId,
          scope: req.access!.scopeOf('companies.view'),
        });
        res.json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  // GET /api/:tenantSlug/dashboard/feed
  router.get('/feed',
    requirePermission('companies.view'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

        // Identity and scope are passed through; the use case decides what
        // each scope may see, so the policy stays in one place.
        const result = await feedUseCase.execute({
          tenantId: requireTenantId(req),
          userId: req.user!.userId,
          scope: req.access!.scopeOf('companies.view'),
          limit,
        });
        res.json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
