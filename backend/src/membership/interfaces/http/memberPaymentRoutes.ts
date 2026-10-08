import { NextFunction, Request, Response, Router } from 'express';
import { z, ZodError } from 'zod';
import { requireTenant } from '@main/interfaces/http/tenantContext';
import { ITokenService } from '../../../auth/application/ports/ITokenService';
import { ITenantRepository } from '../../../tenant/domain/repositories/ITenantRepository';
import { authenticate } from '../../../main/interfaces/http/middlewares/authenticate';
import { resolveTenant } from '../../../main/interfaces/http/middlewares/resolveTenant';
import { loadAccess } from '../../../main/interfaces/http/middlewares/loadAccess';
import { requirePermission } from '../../../main/interfaces/http/middlewares/requirePermission';
import { validateRequest } from '../../../main/interfaces/http/middlewares/validateRequest';
import { ResolveAccessContextUseCase } from '../../../access/application/use-cases/ResolveAccessContextUseCase';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { redactMemberFields } from '../../../access/domain/redactFields';
import { csvRow, UTF8_BOM } from '../../../shared/infrastructure/csv/csvWriter';
import { dayKeyInZone } from '../../../shared/domain/time/tenantDay';
import { InvalidPaymentError, PAYMENT_METHODS } from '../../domain/memberPayment';
import { TIERS } from '../../domain/Tier';
import { MEMBERS_PAYMENTS_RECORD, MEMBERS_PAYMENTS_VIEW } from '../../application/membershipPermissions';
import { MemberNotFoundError } from '../../application/use-cases/MemberUseCases';
import {
  ExportMemberPaymentsUseCase,
  GetPaymentReceiptUseCase,
  PaymentAlreadyVoidedError,
  PaymentNotFoundError,
  PaymentNotLatestError,
  SearchMemberPaymentsUseCase,
  VoidMemberPaymentUseCase,
} from '../../application/use-cases/MemberPaymentUseCases';
import { presentMemberPayment, type MemberPaymentView } from '../../application/presentMemberPayment';
import type { PaymentFilters } from '../../application/ports/IMemberPaymentStore';
import type { PaymentKind } from '../../domain/termDates';

export const voidSchema = z.object({ reason: z.string() }).strict();

const oneOf = <T extends string>(value: unknown, allowed: readonly T[]): T | undefined =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
const day = (value: unknown): string | undefined => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined);
const id = (value: unknown): string | undefined => (typeof value === 'string' && value.length > 0 && value.length <= 191 ? value : undefined);
const whole = (value: unknown): number | undefined => (typeof value === 'string' && /^\d{1,6}$/.test(value) ? Number(value) : undefined);

const filtersOf = (q: Request['query']): PaymentFilters => ({
  from: day(q.from),
  to: day(q.to),
  tier: oneOf(q.tier, TIERS),
  kind: oneOf<PaymentKind>(q.kind, ['NEW', 'RENEWAL', 'UPGRADE']),
  method: oneOf(q.method, PAYMENT_METHODS),
  agentId: id(q.agentId),
  status: oneOf(q.status, ['RECORDED', 'VOIDED'] as const),
  memberId: id(q.memberId),
});

export interface MemberPaymentUseCases {
  search: SearchMemberPaymentsUseCase;
  export: ExportMemberPaymentsUseCase;
  receipt: GetPaymentReceiptUseCase;
  void: VoidMemberPaymentUseCase;
}

const CSV_HEADER = ['Receipt number', 'Date received', 'Member ID', 'Member', 'Kind', 'From tier', 'Tier', 'List fee', 'Discount %', 'Amount', 'Method', 'Status', 'Recorded by', 'Void reason'];
const csvCells = (p: MemberPaymentView) => [
  p.receiptNumber, p.receivedOn, p.memberNumber, p.memberName, p.kind, p.fromTier, p.toTier, p.listFee, p.discountPercent, p.amount, p.method,
  p.status, p.recordedBy.name ?? '', p.voidReason ?? '',
];

/**
 * `/api/:tenantSlug/membership/payments` (M4 Slice 5). The list, the CSV export
 * and the receipt are "Members: view payments"; voiding is "Members: record
 * payments" (FR-MPAY-06, FR-MPAY-07). Responses go through `redactMemberFields`
 * (FR-MPAY-08).
 */
export const createMemberPaymentRouter = (
  uc: MemberPaymentUseCases,
  tokenService: ITokenService,
  tenantRepository: ITenantRepository,
  resolveAccessContext: ResolveAccessContextUseCase
): Router => {
  const router = Router({ mergeParams: true });
  router.use(authenticate(tokenService));
  router.use(resolveTenant(tenantRepository));
  router.use(loadAccess(resolveAccessContext));
  const view = requirePermission(MEMBERS_PAYMENTS_VIEW);
  const record = requirePermission(MEMBERS_PAYMENTS_RECORD);

  const fail = (res: Response, next: NextFunction, error: unknown) => {
    if (error instanceof ZodError) return res.status(400).json({ error: 'Validation failed', details: error.issues });
    if (error instanceof PermissionDeniedError) return res.status(403).json({ error: error.message });
    if (error instanceof InvalidPaymentError) return res.status(400).json({ error: error.message, code: error.code, field: error.field });
    if (error instanceof PaymentNotFoundError || error instanceof MemberNotFoundError) return res.status(404).json({ error: error.message, code: error.code });
    if (error instanceof PaymentNotLatestError || error instanceof PaymentAlreadyVoidedError) return res.status(409).json({ error: error.message, code: error.code });
    return next(error);
  };

  router.get('/', view, async (req, res, next) => {
    try {
      const tenant = requireTenant(req);
      const result = await uc.search.execute({
        access: req.access!,
        tenantId: tenant.id,
        filters: filtersOf(req.query),
        page: whole(req.query.page),
        limit: whole(req.query.limit),
      });
      res.json(redactMemberFields(result, req.access!));
    } catch (error) {
      fail(res, next, error);
    }
  });

  // Declared before `/:id/...` so "export.csv" is never read as an id.
  router.get('/export.csv', view, async (req, res, next) => {
    try {
      const tenant = requireTenant(req);
      const result = await uc.export.execute({ access: req.access!, tenantId: tenant.id, filters: filtersOf(req.query) });
      res.status(200);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="membership-payments-${dayKeyInZone(new Date(), tenant.timezone)}.csv"`);
      res.write(UTF8_BOM + csvRow(CSV_HEADER));
      for (const row of result.rows) res.write(csvRow(csvCells(row)));
      res.end();
    } catch (error) {
      if (res.headersSent) return res.end();
      fail(res, next, error);
    }
  });

  router.get('/:id/receipt.pdf', view, async (req, res, next) => {
    try {
      const tenant = requireTenant(req);
      const issuer = await tenantRepository.findById(tenant.id);
      const { pdf, receiptNumber } = await uc.receipt.execute({
        access: req.access!,
        tenantId: tenant.id,
        paymentId: String(req.params.id),
        language: req.query.lang === 'en' ? 'en' : 'sq',
        issuerName: issuer?.name ?? '',
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', pdf.length);
      res.setHeader('Content-Disposition', `inline; filename="${receiptNumber}.pdf"`);
      res.send(pdf);
    } catch (error) {
      fail(res, next, error);
    }
  });

  router.post('/:id/void', record, validateRequest(voidSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenant = requireTenant(req);
      const voided = await uc.void.execute({ access: req.access!, tenantId: tenant.id, timezone: tenant.timezone, paymentId: String(req.params.id), reason: req.body.reason });
      res.json(redactMemberFields({ data: presentMemberPayment(voided, {}) }, req.access!));
    } catch (error) {
      fail(res, next, error);
    }
  });

  return router;
};
