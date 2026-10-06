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
import { InvalidContractSettingsError } from '../../domain/ContractSettings';
import {
  GetContractSettingsUseCase,
  MANAGE_SETTINGS,
  UpdateContractSettingsUseCase,
} from '../../application/use-cases/ContractSettingsUseCases';

// Shape only; the ranges are the domain's, so the 400 carries the field and the reason.
const patchSchema = z
  .object({
    reminderLeadDays: z.array(z.number()).optional(),
    expiringSoonDays: z.number().optional(),
    paymentGraceDays: z.number().optional(),
    numberPrefix: z.string().optional(),
  })
  .strict();

function send(res: Response, next: NextFunction, error: unknown) {
  if (error instanceof ZodError) return res.status(400).json({ error: 'Validation failed', details: error.issues });
  if (error instanceof PermissionDeniedError) return res.status(403).json({ error: error.message });
  if (error instanceof InvalidContractSettingsError) return res.status(400).json({ error: error.message, code: error.code, field: error.field });
  return next(error);
}

/** `/api/:tenantSlug/settings/contracts` (M3 Slice 3), under `settings.manage`. */
export const createContractSettingsRouter = (
  getSettings: GetContractSettingsUseCase,
  updateSettings: UpdateContractSettingsUseCase,
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
