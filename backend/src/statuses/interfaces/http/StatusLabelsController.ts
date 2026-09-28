import { NextFunction, Request, Response } from 'express';
import { requireTenantId } from '@main/interfaces/http/tenantContext';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { StatusDomain } from '../../domain/StatusCatalogue';
import { InvalidStatusLabelError, InvalidStatusOrderError, StatusKeyNotFoundError } from '../../domain/StatusLabel';
import { ListStatusLabelsUseCase } from '../../application/use-cases/ListStatusLabelsUseCase';
import { UpdateStatusLabelUseCase } from '../../application/use-cases/UpdateStatusLabelUseCase';
import { ReorderStatusLabelsUseCase } from '../../application/use-cases/ReorderStatusLabelsUseCase';

function sendStatusError(res: Response, next: NextFunction, error: unknown) {
  if (error instanceof PermissionDeniedError) {
    return res.status(403).json({ error: error.message });
  }
  if (error instanceof StatusKeyNotFoundError) {
    return res.status(404).json({ error: error.message, code: error.code });
  }
  if (error instanceof InvalidStatusLabelError) {
    return res.status(400).json({ error: error.message, code: error.code, field: error.field });
  }
  if (error instanceof InvalidStatusOrderError) {
    return res.status(400).json({ error: error.message, code: error.code });
  }
  return next(error);
}

const domainOf = (req: Request): StatusDomain => (req.params.domain as string).toUpperCase() as StatusDomain;

/** Settings → Statuses (Slice 10: FR-SET-07, 08). Parses, calls one use case, maps the result. */
export class StatusLabelsController {
  constructor(
    private readonly listLabels: ListStatusLabelsUseCase,
    private readonly updateLabel: UpdateStatusLabelUseCase,
    private readonly reorderLabels: ReorderStatusLabelsUseCase
  ) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.listLabels.execute({ tenantId: requireTenantId(req), domain: domainOf(req) });
      res.status(200).json({ data });
    } catch (error) {
      sendStatusError(res, next, error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const item = await this.updateLabel.execute({
        access: req.access!,
        tenantId: requireTenantId(req),
        domain: domainOf(req),
        key: req.params.key as string,
        edit: req.body,
      });
      res.status(200).json({ item });
    } catch (error) {
      sendStatusError(res, next, error);
    }
  };

  reorder = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.reorderLabels.execute({
        access: req.access!,
        tenantId: requireTenantId(req),
        domain: domainOf(req),
        keys: req.body.keys,
      });
      res.status(200).json({ data });
    } catch (error) {
      sendStatusError(res, next, error);
    }
  };
}
