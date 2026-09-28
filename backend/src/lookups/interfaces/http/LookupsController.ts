import { NextFunction, Request, Response } from 'express';
import { requireTenantId } from '@main/interfaces/http/tenantContext';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { LookupList } from '../../domain/LookupList';
import {
  AreaHasActiveCitiesError,
  InactiveAreaError,
  InactiveRiskLevelError,
  InvalidLookupOrderError,
  InvalidLookupValueError,
  LookupItemInUseError,
  LookupItemNotFoundError,
  LookupValueTakenError,
  RiskLevelStillUsedError,
} from '../../domain/errors';
import { ListLookupItemsUseCase } from '../../application/use-cases/ListLookupItemsUseCase';
import { CreateLookupItemUseCase } from '../../application/use-cases/CreateLookupItemUseCase';
import { UpdateLookupItemUseCase } from '../../application/use-cases/UpdateLookupItemUseCase';
import { ReorderLookupItemsUseCase } from '../../application/use-cases/ReorderLookupItemsUseCase';
import { SetLookupItemActiveUseCase } from '../../application/use-cases/SetLookupItemActiveUseCase';
import { DeleteLookupItemUseCase } from '../../application/use-cases/DeleteLookupItemUseCase';

/** Maps the lookup module's errors to a status; anything else goes to the app's error handler. */
function sendLookupError(res: Response, next: NextFunction, error: unknown) {
  if (error instanceof PermissionDeniedError) {
    return res.status(403).json({ error: error.message });
  }
  if (error instanceof LookupItemNotFoundError) {
    return res.status(404).json({ error: error.message, code: error.code });
  }
  if (error instanceof InvalidLookupValueError || error instanceof InactiveRiskLevelError || error instanceof InactiveAreaError) {
    return res.status(400).json({ error: error.message, code: error.code, field: error.field });
  }
  if (error instanceof InvalidLookupOrderError) {
    return res.status(400).json({ error: error.message, code: error.code });
  }
  if (error instanceof LookupValueTakenError) {
    return res.status(409).json({ error: error.message, code: error.code, field: error.field });
  }
  if (error instanceof LookupItemInUseError) {
    return res.status(409).json({ error: error.message, code: error.code, usages: error.usages });
  }
  if (error instanceof RiskLevelStillUsedError) {
    return res.status(409).json({ error: error.message, code: error.code, activeBusinessTypes: error.activeBusinessTypes });
  }
  if (error instanceof AreaHasActiveCitiesError) {
    return res.status(409).json({ error: error.message, code: error.code, activeCities: error.activeCities });
  }
  return next(error);
}

const listOf = (req: Request) => req.params.list as LookupList;

/** Query params beyond `includeInactive`, e.g. `areaId` (FR-SET-04). Unrecognised keys are dropped by the use case. */
const filterOf = (req: Request): Record<string, unknown> => {
  const { includeInactive: _includeInactive, ...filter } = req.query;
  return filter;
};

/** Settings → Lists (Slice 8). Parses, calls one use case, maps the result. */
export class LookupsController {
  constructor(
    private readonly listItems: ListLookupItemsUseCase,
    private readonly createItem: CreateLookupItemUseCase,
    private readonly updateItem: UpdateLookupItemUseCase,
    private readonly reorderItems: ReorderLookupItemsUseCase,
    private readonly setItemActive: SetLookupItemActiveUseCase,
    private readonly deleteItem: DeleteLookupItemUseCase
  ) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.listItems.execute({
        access: req.access!,
        tenantId: requireTenantId(req),
        list: listOf(req),
        includeInactive: req.query.includeInactive === 'true',
        filter: filterOf(req),
      });
      res.status(200).json({ data });
    } catch (error) {
      sendLookupError(res, next, error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const item = await this.createItem.execute({ access: req.access!, tenantId: requireTenantId(req), list: listOf(req), values: req.body });
      res.status(201).json({ item });
    } catch (error) {
      sendLookupError(res, next, error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const item = await this.updateItem.execute({
        access: req.access!,
        tenantId: requireTenantId(req),
        list: listOf(req),
        id: req.params.id as string,
        values: req.body,
      });
      res.status(200).json({ item });
    } catch (error) {
      sendLookupError(res, next, error);
    }
  };

  reorder = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.reorderItems.execute({
        access: req.access!,
        tenantId: requireTenantId(req),
        list: listOf(req),
        ids: req.body.ids,
        filter: filterOf(req),
      });
      res.status(200).json({ data });
    } catch (error) {
      sendLookupError(res, next, error);
    }
  };

  deactivate = (req: Request, res: Response, next: NextFunction) => this.setActive(req, res, next, false, req.body.cascade === true);

  reactivate = (req: Request, res: Response, next: NextFunction) => this.setActive(req, res, next, true);

  remove = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.deleteItem.execute({ access: req.access!, tenantId: requireTenantId(req), list: listOf(req), id: req.params.id as string });
      res.status(204).send();
    } catch (error) {
      sendLookupError(res, next, error);
    }
  };

  private async setActive(req: Request, res: Response, next: NextFunction, active: boolean, cascade?: boolean) {
    try {
      const item = await this.setItemActive.execute({
        access: req.access!,
        tenantId: requireTenantId(req),
        list: listOf(req),
        id: req.params.id as string,
        active,
        cascade,
      });
      res.status(200).json({ item });
    } catch (error) {
      sendLookupError(res, next, error);
    }
  }
}
