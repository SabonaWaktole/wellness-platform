import { NextFunction, Request, Response } from 'express';
import { requireTenantId } from '@main/interfaces/http/tenantContext';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { redactFields } from '../../../access/domain/redactFields';
import {
  BandsOverlapError,
  InvalidPricingOrderError,
  InvalidPricingValueError,
  PricingConflictError,
  PricingItemNotFoundError,
  PricingNameTakenError,
} from '../../domain/errors';
import { PricingList } from '../../domain/PricingLists';
import { GetPricingConfigurationUseCase } from '../../application/use-cases/GetPricingConfigurationUseCase';
import { CreatePricingItemUseCase } from '../../application/use-cases/CreatePricingItemUseCase';
import { UpdatePricingItemUseCase } from '../../application/use-cases/UpdatePricingItemUseCase';
import { ReorderPricingItemsUseCase } from '../../application/use-cases/ReorderPricingItemsUseCase';
import { SetPricingItemActiveUseCase } from '../../application/use-cases/SetPricingItemActiveUseCase';
import { DeletePricingItemUseCase } from '../../application/use-cases/DeletePricingItemUseCase';
import { SetPriceZoneCitiesUseCase } from '../../application/use-cases/SetPriceZoneCitiesUseCase';
import { SetRiskSurchargeUseCase } from '../../application/use-cases/SetRiskSurchargeUseCase';
import { SetDiscountCapUseCase } from '../../application/use-cases/SetDiscountCapUseCase';
import { ListCitiesWithoutZoneUseCase } from '../../application/use-cases/ListCitiesWithoutZoneUseCase';
import { TestPriceCalculationUseCase } from '../../application/use-cases/TestPriceCalculationUseCase';
import { CreateServicePackageUseCase } from '../../application/use-cases/CreateServicePackageUseCase';
import { SetPackageServicesUseCase } from '../../application/use-cases/SetPackageServicesUseCase';
import { SetDefaultPackageUseCase } from '../../application/use-cases/SetDefaultPackageUseCase';
import { ListActivePackagesUseCase } from '../../application/use-cases/ListActivePackagesUseCase';
import { UpdateOfferSettingsUseCase } from '../../application/use-cases/UpdateOfferSettingsUseCase';

/** Maps the pricing module's errors to a status; anything else goes to the app's error handler. */
function sendPricingError(res: Response, next: NextFunction, error: unknown) {
  if (error instanceof PermissionDeniedError) {
    return res.status(403).json({ error: error.message });
  }
  if (error instanceof PricingItemNotFoundError) {
    return res.status(404).json({ error: error.message, code: error.code });
  }
  if (error instanceof InvalidPricingValueError) {
    return res.status(400).json({ error: error.message, code: error.code, field: error.field });
  }
  if (error instanceof BandsOverlapError) {
    return res.status(400).json({ error: error.message, code: error.code, field: error.field, overlapsWith: error.overlapsWith });
  }
  if (error instanceof InvalidPricingOrderError) {
    return res.status(400).json({ error: error.message, code: error.code });
  }
  if (error instanceof PricingNameTakenError) {
    return res.status(409).json({ error: error.message, code: error.code, field: error.field });
  }
  if (error instanceof PricingConflictError) {
    return res.status(409).json({ error: error.message, code: error.code, names: error.names });
  }
  return next(error);
}

const listOf = (req: Request) => req.params.list as PricingList;

/**
 * Settings → Pricing (M2 Slices 3 and 4). Parses, calls one use case, and sends the
 * result through `redactFields`, so a custom role holding `pricing.manage`
 * without `commercial.view` still receives no amounts (FR-RBAC-17).
 */
export class PricingController {
  constructor(
    private readonly getConfiguration: GetPricingConfigurationUseCase,
    private readonly createItem: CreatePricingItemUseCase,
    private readonly updateItem: UpdatePricingItemUseCase,
    private readonly reorderItems: ReorderPricingItemsUseCase,
    private readonly setItemActive: SetPricingItemActiveUseCase,
    private readonly deleteItem: DeletePricingItemUseCase,
    private readonly setZoneCities: SetPriceZoneCitiesUseCase,
    private readonly setRiskSurcharge: SetRiskSurchargeUseCase,
    private readonly setDiscountCap: SetDiscountCapUseCase,
    private readonly listCitiesWithoutZone: ListCitiesWithoutZoneUseCase,
    private readonly testCalculation: TestPriceCalculationUseCase,
    private readonly createServicePackage: CreateServicePackageUseCase,
    private readonly setPackageServices: SetPackageServicesUseCase,
    private readonly setDefaultPackage: SetDefaultPackageUseCase,
    private readonly listActivePackages: ListActivePackagesUseCase,
    private readonly updateOfferSettings: UpdateOfferSettingsUseCase
  ) {}

  private handle =
    (status: number, work: (req: Request) => Promise<unknown>) => async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = await work(req);
        if (body === undefined) {
          res.status(status).send();
        } else {
          res.status(status).json(redactFields(body, req.access!));
        }
      } catch (error) {
        sendPricingError(res, next, error);
      }
    };

  config = this.handle(200, async (req) => ({
    data: await this.getConfiguration.execute({ access: req.access!, tenantId: requireTenantId(req) }),
  }));

  citiesWithoutZone = this.handle(200, async (req) => ({
    data: await this.listCitiesWithoutZone.execute({ access: req.access!, tenantId: requireTenantId(req) }),
  }));

  calculate = this.handle(200, async (req) => ({
    result: await this.testCalculation.execute({ access: req.access!, tenantId: requireTenantId(req), ...req.body }),
  }));

  create = this.handle(201, async (req) => ({
    item: await this.createItem.execute({ access: req.access!, tenantId: requireTenantId(req), list: listOf(req), values: req.body }),
  }));

  update = this.handle(200, async (req) => ({
    item: await this.updateItem.execute({
      access: req.access!,
      tenantId: requireTenantId(req),
      list: listOf(req),
      id: req.params.id as string,
      values: req.body,
    }),
  }));

  reorder = this.handle(200, async (req) => ({
    data: await this.reorderItems.execute({ access: req.access!, tenantId: requireTenantId(req), list: listOf(req), ids: req.body.ids }),
  }));

  deactivate = this.handle(200, (req) => this.setActive(req, false));

  reactivate = this.handle(200, (req) => this.setActive(req, true));

  remove = this.handle(204, async (req) => {
    await this.deleteItem.execute({ access: req.access!, tenantId: requireTenantId(req), list: listOf(req), id: req.params.id as string });
    return undefined;
  });

  zoneCities = this.handle(200, async (req) => ({
    item: await this.setZoneCities.execute({
      access: req.access!,
      tenantId: requireTenantId(req),
      zoneId: req.params.id as string,
      cityIds: req.body.cityIds,
    }),
  }));

  riskSurcharge = this.handle(200, async (req) => ({
    item: await this.setRiskSurcharge.execute({
      access: req.access!,
      tenantId: requireTenantId(req),
      riskLevelId: req.params.riskLevelId as string,
      riskSurchargePercent: req.body.riskSurchargePercent,
    }),
  }));

  discountCap = this.handle(200, async (req) => ({
    data: await this.setDiscountCap.execute({
      access: req.access!,
      tenantId: requireTenantId(req),
      discountCapPercent: req.body.discountCapPercent,
    }),
  }));

  createPackage = this.handle(201, async (req) => {
    const { serviceIds, ...values } = req.body;
    return {
      item: await this.createServicePackage.execute({ access: req.access!, tenantId: requireTenantId(req), values, serviceIds }),
    };
  });

  packageServices = this.handle(200, async (req) => ({
    item: await this.setPackageServices.execute({
      access: req.access!,
      tenantId: requireTenantId(req),
      packageId: req.params.id as string,
      serviceIds: req.body.serviceIds,
    }),
  }));

  defaultPackage = this.handle(200, async (req) => ({
    item: await this.setDefaultPackage.execute({ access: req.access!, tenantId: requireTenantId(req), packageId: req.params.id as string }),
  }));

  activePackages = this.handle(200, async (req) => ({
    data: await this.listActivePackages.execute({ access: req.access!, tenantId: requireTenantId(req) }),
  }));

  offerSettings = this.handle(200, async (req) => ({
    data: await this.updateOfferSettings.execute({ access: req.access!, tenantId: requireTenantId(req), values: req.body }),
  }));

  private async setActive(req: Request, active: boolean) {
    return {
      item: await this.setItemActive.execute({
        access: req.access!,
        tenantId: requireTenantId(req),
        list: listOf(req),
        id: req.params.id as string,
        active,
      }),
    };
  }
}
