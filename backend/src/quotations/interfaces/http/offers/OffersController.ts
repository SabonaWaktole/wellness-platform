import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { requireTenant, requireTenantId } from '@main/interfaces/http/tenantContext';
import { PermissionDeniedError } from '../../../../access/domain/errors';
import { redactFields } from '../../../../access/domain/redactFields';
import {
  InvalidSentDateError,
  OfferNotEditableError,
  OfferNotFoundError,
  OfferNotLatestError,
  OfferNotReadyError,
  OfferTransitionError,
} from '../../../domain/offerErrors';
import { ListOffersUseCase } from '../../../application/offers/ListOffersUseCase';
import { GetOfferDocumentUseCase } from '../../../application/offers/GetOfferDocumentUseCase';
import { MarkOfferReadyUseCase } from '../../../application/offers/MarkOfferReadyUseCase';
import { MarkOfferSentUseCase } from '../../../application/offers/MarkOfferSentUseCase';
import { RecordOfferResponseUseCase } from '../../../application/offers/RecordOfferResponseUseCase';
import { ReviseOfferUseCase } from '../../../application/offers/ReviseOfferUseCase';
import { offerSchemas } from './offerSchemas';

/** Maps the offer errors to a status; anything else goes to the app's error handler. */
function sendOfferError(res: Response, next: NextFunction, error: unknown) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }
  if (error instanceof PermissionDeniedError) return res.status(403).json({ error: error.message });
  if (error instanceof OfferNotFoundError) return res.status(404).json({ error: error.message, code: error.code });
  if (error instanceof InvalidSentDateError) {
    return res.status(400).json({ error: error.message, code: error.code, field: error.field });
  }
  if (error instanceof OfferNotReadyError) {
    return res.status(409).json({ error: error.message, code: error.code, reason: error.reason });
  }
  if (error instanceof OfferTransitionError || error instanceof OfferNotLatestError || error instanceof OfferNotEditableError) {
    return res.status(409).json({ error: error.message, code: error.code });
  }
  return next(error);
}

const idOf = (req: Request) => req.params.id as string;

/** RFC 6266: an ASCII name plus the UTF-8 one. Ours is ASCII already (`companySlug`). */
const contentDisposition = (disposition: 'inline' | 'attachment', fileName: string) =>
  `${disposition}; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;

/**
 * Offers (M2 Slice 9): the list, the PDF and the status steps. Parses, calls
 * one use case, maps the result. JSON responses go through `redactFields`
 * (FR-RBAC-17).
 */
export class OffersController {
  constructor(
    private readonly listOffers: ListOffersUseCase,
    private readonly getDocument: GetOfferDocumentUseCase,
    private readonly markReady: MarkOfferReadyUseCase,
    private readonly markSent: MarkOfferSentUseCase,
    private readonly respond: RecordOfferResponseUseCase,
    private readonly revise: ReviseOfferUseCase
  ) {}

  private handle =
    (work: (req: Request) => Promise<unknown>, status = 200) =>
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        res.status(status).json({ data: redactFields(await work(req), req.access!) });
      } catch (error) {
        sendOfferError(res, next, error);
      }
    };

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = offerSchemas.list.parse(req.query);
      const page = await this.listOffers.execute({
        access: req.access!,
        tenantId: requireTenantId(req),
        filters: {
          statuses: query.status,
          ownerUserId: query.ownerUserId,
          clientId: query.clientId,
          query: query.q?.trim() || undefined,
          createdFrom: query.createdFrom,
          createdTo: query.createdTo,
        },
        page: query.page,
        pageSize: query.pageSize,
      });
      res.json(redactFields(page, req.access!));
    } catch (error) {
      sendOfferError(res, next, error);
    }
  };

  /**
   * FR-OFR-05, 06: the same PDF inline (the preview) or as an attachment (the
   * download), named Oferta_<company>_<number>.pdf. Never cached: a draft
   * changes, and the figures are commercial.
   */
  pdf = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = offerSchemas.pdf.parse(req.query);
      const tenant = requireTenant(req);
      const { pdf, fileName } = await this.getDocument.execute({
        access: req.access!,
        tenantId: tenant.id,
        offerId: idOf(req),
        language: query.lang,
        timeZone: tenant.timezone,
        disposition: query.disposition,
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', pdf.length);
      res.setHeader('Content-Disposition', contentDisposition(query.disposition, fileName));
      res.setHeader('Cache-Control', 'private, no-store');
      res.end(pdf);
    } catch (error) {
      sendOfferError(res, next, error);
    }
  };

  ready = this.handle((req) => this.markReady.execute({ access: req.access!, tenantId: requireTenantId(req), offerId: idOf(req) }));

  sent = this.handle((req) =>
    this.markSent.execute({ access: req.access!, tenantId: requireTenantId(req), offerId: idOf(req), sentDate: req.body.sentDate })
  );

  accepted = this.handle((req) =>
    this.respond.execute({
      access: req.access!,
      tenantId: requireTenantId(req),
      offerId: idOf(req),
      response: 'ACCEPTED',
      note: req.body.note ?? null,
    })
  );

  rejected = this.handle((req) =>
    this.respond.execute({
      access: req.access!,
      tenantId: requireTenantId(req),
      offerId: idOf(req),
      response: 'REJECTED',
      note: req.body.note ?? null,
    })
  );

  /** 201: the new version (FR-OFR-11). */
  revised = this.handle((req) => this.revise.execute({ access: req.access!, tenantId: requireTenantId(req), offerId: idOf(req) }), 201);
}
