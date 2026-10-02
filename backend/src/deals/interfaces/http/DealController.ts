import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { requireTenant, requireTenantId } from '@main/interfaces/http/tenantContext';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { redactFields } from '../../../access/domain/redactFields';
import { DealHasSentOfferError, DealNotFoundError, DealStageNotAllowedError, InvalidDealError } from '../../domain/errors';
import { DealStage } from '../../domain/DealStage';
import { DealType } from '../../domain/DealType';
import { CreateDealUseCase } from '../../application/use-cases/CreateDealUseCase';
import { GetDealUseCase } from '../../application/use-cases/GetDealUseCase';
import { UpdateDealUseCase } from '../../application/use-cases/UpdateDealUseCase';
import { ChangeDealStageUseCase } from '../../application/use-cases/ChangeDealStageUseCase';
import { ReassignDealUseCase } from '../../application/use-cases/ReassignDealUseCase';
import { DeleteDealUseCase } from '../../application/use-cases/DeleteDealUseCase';
import { SearchDealsUseCase } from '../../application/use-cases/SearchDealsUseCase';
import { GetPipelineBoardUseCase } from '../../application/use-cases/GetPipelineBoardUseCase';
import { GetDealActivitiesUseCase } from '../../application/use-cases/GetDealActivitiesUseCase';
import { GetDealOffersUseCase } from '../../application/use-cases/GetDealOffersUseCase';
import { SaveDraftOfferUseCase } from '../../../quotations/application/offers/SaveDraftOfferUseCase';
import { OfferNotEditableError, OfferReviseFirstError } from '../../../quotations/domain/offerErrors';
import { InvalidPricingInputError, InvalidPricingValueError, PricingSubjectNotFoundError } from '../../../pricing/domain/errors';
import { dealSchemas } from './dealSchemas';

/** Maps the deals module's errors to a status; anything else goes to the app's error handler. */
function sendDealError(res: Response, next: NextFunction, error: unknown) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }
  if (error instanceof PermissionDeniedError) {
    return res.status(403).json({ error: error.message });
  }
  if (error instanceof DealNotFoundError || error instanceof PricingSubjectNotFoundError) {
    return res.status(404).json({ error: error.message, code: error.code });
  }
  if (error instanceof InvalidDealError) {
    return res.status(400).json({ error: error.message, code: error.code, field: error.field });
  }
  if (error instanceof InvalidPricingInputError || error instanceof InvalidPricingValueError) {
    return res.status(400).json({ error: error.message, code: error.code, field: error.field });
  }
  if (
    error instanceof DealStageNotAllowedError ||
    error instanceof OfferNotEditableError ||
    error instanceof OfferReviseFirstError ||
    error instanceof DealHasSentOfferError
  ) {
    return res.status(409).json({ error: error.message, code: error.code });
  }
  return next(error);
}

const idOf = (req: Request) => req.params.id as string;

/**
 * Deals and the pipeline (M2 Slice 6). Parses, calls one use case, maps the
 * result. Every response goes through `redactFields`, so a deal's values
 * never reach a role without `commercial.view` (FR-RBAC-17).
 */
export class DealController {
  constructor(
    private readonly createDeal: CreateDealUseCase,
    private readonly getDeal: GetDealUseCase,
    private readonly updateDeal: UpdateDealUseCase,
    private readonly changeStage: ChangeDealStageUseCase,
    private readonly reassignDeal: ReassignDealUseCase,
    private readonly deleteDeal: DeleteDealUseCase,
    private readonly searchDeals: SearchDealsUseCase,
    private readonly pipeline: GetPipelineBoardUseCase,
    private readonly dealActivities: GetDealActivitiesUseCase,
    private readonly dealOffers: GetDealOffersUseCase,
    private readonly saveDraftOffer: SaveDraftOfferUseCase
  ) {}

  private handle =
    (work: (req: Request) => Promise<unknown>, status = 200) =>
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        res.status(status).json({ data: redactFields(await work(req), req.access!) });
      } catch (error) {
        sendDealError(res, next, error);
      }
    };

  list = this.handle((req) => {
    const query = dealSchemas.list.parse(req.query);
    return this.searchDeals.execute({
      access: req.access!,
      tenantId: requireTenantId(req),
      filters: {
        clientId: query.clientId,
        ownerUserId: query.ownerUserId,
        stages: query.stage,
        types: query.type,
        businessTypeId: query.businessTypeId,
        areaId: query.areaId,
        cityId: query.cityId,
        expectedCloseFrom: query.expectedCloseFrom,
        expectedCloseTo: query.expectedCloseTo,
        valueMin: query.valueMin,
        valueMax: query.valueMax,
        query: query.q?.trim() || undefined,
      },
      sort: { field: query.sort, direction: query.direction },
      page: query.page,
      pageSize: query.pageSize,
    });
  });

  board = this.handle((req) => {
    const tenant = requireTenant(req);
    return this.pipeline.board({ access: req.access!, tenantId: tenant.id, timeZone: tenant.timezone });
  });

  column = this.handle((req) => {
    const query = dealSchemas.column.parse(req.query);
    const tenant = requireTenant(req);
    return this.pipeline.column({
      access: req.access!,
      tenantId: tenant.id,
      timeZone: tenant.timezone,
      stage: query.stage,
      cursor: query.cursor ?? null,
    });
  });

  get = this.handle((req) => this.getDeal.execute({ access: req.access!, tenantId: requireTenantId(req), id: idOf(req) }));

  activities = this.handle((req) =>
    this.dealActivities.execute({ access: req.access!, tenantId: requireTenantId(req), id: idOf(req) })
  );

  offers = this.handle((req) => this.dealOffers.execute({ access: req.access!, tenantId: requireTenantId(req), id: idOf(req) }));

  /** 201 for the deal's first draft, 200 when the draft is updated (FR-PRC-12). */
  saveOffer = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { note, alsoUpdateCompany, contactPersonId, ...choices } = req.body;
      const { offer, created } = await this.saveDraftOffer.execute({
        access: req.access!,
        tenantId: requireTenantId(req),
        dealId: idOf(req),
        choices,
        note: note ?? null,
        alsoUpdateCompany: alsoUpdateCompany ?? false,
        contactPersonId,
      });
      res.status(created ? 201 : 200).json({ data: redactFields(offer, req.access!) });
    } catch (error) {
      sendDealError(res, next, error);
    }
  };

  create = this.handle(
    (req) =>
      this.createDeal.execute({
        access: req.access!,
        tenantId: requireTenantId(req),
        clientId: req.body.clientId,
        type: req.body.type as DealType,
        title: req.body.title,
        ownerUserId: req.body.ownerUserId,
        expectedCloseDate: req.body.expectedCloseDate,
        notes: req.body.notes,
      }),
    201
  );

  update = this.handle((req) =>
    this.updateDeal.execute({ access: req.access!, tenantId: requireTenantId(req), id: idOf(req), edit: req.body })
  );

  stage = this.handle((req) =>
    this.changeStage.execute({
      access: req.access!,
      tenantId: requireTenantId(req),
      id: idOf(req),
      stage: req.body.stage as DealStage,
    })
  );

  reassign = this.handle((req) =>
    this.reassignDeal.execute({
      access: req.access!,
      tenantId: requireTenantId(req),
      id: idOf(req),
      ownerUserId: req.body.ownerUserId,
    })
  );

  remove = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.deleteDeal.execute({ access: req.access!, tenantId: requireTenantId(req), id: idOf(req) });
      res.status(204).end();
    } catch (error) {
      sendDealError(res, next, error);
    }
  };
}
