import { NextFunction, Request, Response, Router } from 'express';
import { z, ZodError } from 'zod';
import { requireTenantId } from '@main/interfaces/http/tenantContext';
import { ITokenService } from '../../../auth/application/ports/ITokenService';
import { ITenantRepository } from '../../../tenant/domain/repositories/ITenantRepository';
import { authenticate } from '../../../main/interfaces/http/middlewares/authenticate';
import { resolveTenant } from '../../../main/interfaces/http/middlewares/resolveTenant';
import { loadAccess } from '../../../main/interfaces/http/middlewares/loadAccess';
import { requirePermission } from '../../../main/interfaces/http/middlewares/requirePermission';
import { validateRequest } from '../../../main/interfaces/http/middlewares/validateRequest';
import { ResolveAccessContextUseCase } from '../../../access/application/use-cases/ResolveAccessContextUseCase';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { InvalidSalesSettingsError, SALES_SETTINGS_LIMITS } from '../../domain/SalesSettings';
import { GetSalesSettingsUseCase, MANAGE_SETTINGS, UpdateSalesSettingsUseCase } from '../../application/use-cases/SalesSettingsUseCases';

const patchSchema = z
  .object({
    staleDealDays: z.number().int().min(SALES_SETTINGS_LIMITS.staleDealDays.min).max(SALES_SETTINGS_LIMITS.staleDealDays.max).optional(),
  })
  .strict();

function send(res: Response, next: NextFunction, error: unknown) {
  if (error instanceof ZodError) return res.status(400).json({ error: 'Validation failed', details: error.issues });
  if (error instanceof PermissionDeniedError) return res.status(403).json({ error: error.message });
  if (error instanceof InvalidSalesSettingsError) return res.status(400).json({ error: error.message, code: error.code, field: error.field });
  return next(error);
}

/** `/api/:tenantSlug/sales-settings` (M2 Slice 11, FR-DEAL-12), under `settings.manage`. */
export const createSalesSettingsRouter = (
  getSettings: GetSalesSettingsUseCase,
  updateSettings: UpdateSalesSettingsUseCase,
  tokenService: ITokenService,
  tenantRepository: ITenantRepository,
  resolveAccessContext: ResolveAccessContextUseCase
): Router => {
  const router = Router({ mergeParams: true });
  router.use(authenticate(tokenService));
  router.use(resolveTenant(tenantRepository));
  router.use(loadAccess(resolveAccessContext));
  const manage = requirePermission(MANAGE_SETTINGS);

  router.get('/', manage, async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ data: await getSettings.execute({ access: req.access!, tenantId: requireTenantId(req) }) });
    } catch (error) {
      send(res, next, error);
    }
  });
  router.patch('/', manage, validateRequest(patchSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ data: await updateSettings.execute({ access: req.access!, tenantId: requireTenantId(req), patch: req.body }) });
    } catch (error) {
      send(res, next, error);
    }
  });
  return router;
};
