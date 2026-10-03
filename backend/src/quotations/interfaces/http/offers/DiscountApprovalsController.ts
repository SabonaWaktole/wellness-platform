import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { requireTenantId } from '@main/interfaces/http/tenantContext';
import { PermissionDeniedError } from '../../../../access/domain/errors';
import { redactFields } from '../../../../access/domain/redactFields';
import { InvalidPricingValueError } from '../../../../pricing/domain/errors';
import { DiscountApprovalNotFoundError, DiscountApprovalTransitionError, SelfApprovalError } from '../../../../discounts/domain/errors';
import {
  OfferNotEditableError,
  OfferNotFoundError,
  OfferNotLatestError,
  OfferTransitionError,
} from '../../../domain/offerErrors';
import { DecideDiscountApprovalUseCase } from '../../../application/offers/DecideDiscountApprovalUseCase';
import { ListPendingApprovalsUseCase } from '../../../application/offers/ListPendingApprovalsUseCase';
import { WithdrawDiscountApprovalUseCase } from '../../../application/offers/WithdrawDiscountApprovalUseCase';
import { discountApprovalSchemas } from './discountApprovalSchemas';

/** Maps the discount approval errors to a status; anything else goes to the app's error handler. */
function sendDiscountApprovalError(res: Response, next: NextFunction, error: unknown) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }
  // FR-DSC-09, NFR-SEC-04: deciding without the grant, out of scope, or on
  // one's own request is forbidden, never a conflict.
  if (error instanceof SelfApprovalError) {
    return res.status(403).json({ error: error.message, code: error.code });
  }
  if (error instanceof PermissionDeniedError) {
    return res.status(403).json({ error: error.message, permissionKey: error.permissionKey });
  }
  if (error instanceof OfferNotFoundError || error instanceof DiscountApprovalNotFoundError) {
    return res.status(404).json({ error: error.message, code: error.code });
  }
  if (error instanceof InvalidPricingValueError) {
    return res.status(400).json({ error: error.message });
  }
  if (
    error instanceof DiscountApprovalTransitionError ||
    error instanceof OfferTransitionError ||
    error instanceof OfferNotLatestError ||
    error instanceof OfferNotEditableError
  ) {
    return res.status(409).json({ error: error.message, code: error.code });
  }
  return next(error);
}

const idOf = (req: Request) => req.params.id as string;

/**
 * Discount approvals (M2 Slice 10, FR-DSC-06, 10): the approver's pending
 * list and the inline approve / reject / withdraw steps. Parses, calls one
 * use case, maps the result. JSON responses go through `redactFields`
 * (FR-RBAC-17).
 */
export class DiscountApprovalsController {
  constructor(
    private readonly listPending: ListPendingApprovalsUseCase,
    private readonly decide: DecideDiscountApprovalUseCase,
    private readonly withdrawApproval: WithdrawDiscountApprovalUseCase
  ) {}

  pending = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = discountApprovalSchemas.pending.parse(req.query);
      const page = await this.listPending.execute({
        access: req.access!,
        tenantId: requireTenantId(req),
        page: query.page,
        pageSize: query.pageSize,
      });
      res.json(redactFields(page, req.access!));
    } catch (error) {
      sendDiscountApprovalError(res, next, error);
    }
  };

  approve = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = discountApprovalSchemas.approve.parse(req.body);
      const offer = await this.decide.execute({
        access: req.access!,
        tenantId: requireTenantId(req),
        approvalId: idOf(req),
        decision: { kind: 'APPROVE', approvedPercent: body.approvedPercent, comment: body.comment ?? null },
      });
      res.json({ data: redactFields(offer, req.access!) });
    } catch (error) {
      sendDiscountApprovalError(res, next, error);
    }
  };

  reject = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = discountApprovalSchemas.reject.parse(req.body);
      const offer = await this.decide.execute({
        access: req.access!,
        tenantId: requireTenantId(req),
        approvalId: idOf(req),
        decision: { kind: 'REJECT', comment: body.comment },
      });
      res.json({ data: redactFields(offer, req.access!) });
    } catch (error) {
      sendDiscountApprovalError(res, next, error);
    }
  };

  withdraw = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const offer = await this.withdrawApproval.execute({
        access: req.access!,
        tenantId: requireTenantId(req),
        approvalId: idOf(req),
      });
      res.json({ data: redactFields(offer, req.access!) });
    } catch (error) {
      sendDiscountApprovalError(res, next, error);
    }
  };
}
