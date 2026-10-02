import { NextFunction, Request, Response, Router } from 'express';
import { ITokenService } from '../../../auth/application/ports/ITokenService';
import { ITenantRepository } from '../../../tenant/domain/repositories/ITenantRepository';
import { authenticate } from '../../../main/interfaces/http/middlewares/authenticate';
import { resolveTenant } from '../../../main/interfaces/http/middlewares/resolveTenant';
import { loadAccess } from '../../../main/interfaces/http/middlewares/loadAccess';
import { requirePermission } from '../../../main/interfaces/http/middlewares/requirePermission';
import { validateRequest } from '../../../main/interfaces/http/middlewares/validateRequest';
import { ResolveAccessContextUseCase } from '../../../access/application/use-cases/ResolveAccessContextUseCase';
import { isPricingList, ORDERED_PRICING_LISTS, PricingList } from '../../domain/PricingLists';
import { MANAGE_PRICING } from '../../application/pricingAdmin';
import { PricingController } from './PricingController';
import { pricingSchemas } from './pricingSchemas';

/** Validates the body against the schema of the list named in the URL. */
const validateFor = (schemaOf: (list: PricingList) => Parameters<typeof validateRequest>[0]) =>
  (req: Request, res: Response, next: NextFunction) => validateRequest(schemaOf(req.params.list as PricingList))(req, res, next);

/**
 * `/api/:tenantSlug/pricing`. Every route, reads included, is the
 * Administrator's `pricing.manage`: the pricing model is commercial, so none
 * of it is readable by the rest of the workspace (Slice 3). Salespeople get
 * what they need through the pricing screen's own endpoint (Slice 8).
 */
export const createPricingRouter = (
  controller: PricingController,
  tokenService: ITokenService,
  tenantRepository: ITenantRepository,
  resolveAccessContext: ResolveAccessContextUseCase
): Router => {
  const router = Router({ mergeParams: true });
  router.use(authenticate(tokenService));
  router.use(resolveTenant(tenantRepository));
  router.use(loadAccess(resolveAccessContext));

  const manage = requirePermission(MANAGE_PRICING);
  router.get('/config', manage, controller.config);
  router.get('/cities-without-zone', manage, controller.citiesWithoutZone);
  router.post('/test-calculation', manage, validateRequest(pricingSchemas.testCalculation), controller.calculate);
  router.put('/risk-surcharges/:riskLevelId', manage, validateRequest(pricingSchemas.riskSurcharge), controller.riskSurcharge);
  router.put('/discount-cap', manage, validateRequest(pricingSchemas.discountCap), controller.discountCap);
  router.put('/zones/:id/cities', manage, validateRequest(pricingSchemas.zoneCities), controller.zoneCities);

  // The gate runs before the list check, so a caller without pricing.manage
  // learns nothing about which lists exist.
  const knownList = (req: Request, res: Response, next: NextFunction) =>
    isPricingList(req.params.list as string) ? next() : res.status(404).json({ error: 'Unknown list.' });
  const orderedList = (req: Request, res: Response, next: NextFunction) =>
    ORDERED_PRICING_LISTS.includes(req.params.list as PricingList) ? next() : res.status(404).json({ error: 'Unknown list.' });

  router.post('/:list', manage, knownList, validateFor(pricingSchemas.create), controller.create);
  router.put('/:list/order', manage, orderedList, validateRequest(pricingSchemas.reorder), controller.reorder);
  router.patch('/:list/:id', manage, knownList, validateFor(pricingSchemas.update), controller.update);
  router.post('/:list/:id/deactivate', manage, knownList, controller.deactivate);
  router.post('/:list/:id/reactivate', manage, knownList, controller.reactivate);
  router.delete('/:list/:id', manage, knownList, controller.remove);

  return router;
};
