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
import { MEMBERS_VERIFY } from '../../application/membershipPermissions';
import { InvalidIdentityChoiceError, RecordIdentityCheckUseCase, VerificationNotFoundError, VerifyMemberUseCase } from '../../application/use-cases/VerificationUseCases';

export const identitySchema = z.object({ choice: z.string() }).strict();

export interface VerificationUseCases {
  verify: VerifyMemberUseCase;
  recordIdentity: RecordIdentityCheckUseCase;
}

/**
 * `/api/:tenantSlug/membership/verify` (M4 Slice 13, FR-VER-01..06). Everything
 * here needs "Members: verify" and nothing else: Reception can check a card
 * without being able to open the member record. Every answer is calculated now
 * and sent `no-store`, so a suspension shows at the next check (FR-VER-05).
 *
 * The routes carry the card token only in the path of the one lookup the
 * scanner makes; it is never logged here (FR-CRD-08).
 */
export const createVerificationRouter = (
  uc: VerificationUseCases,
  tokenService: ITokenService,
  tenantRepository: ITenantRepository,
  resolveAccessContext: ResolveAccessContextUseCase
): Router => {
  const router = Router({ mergeParams: true });
  router.use(authenticate(tokenService));
  router.use(resolveTenant(tenantRepository));
  router.use(loadAccess(resolveAccessContext));
  router.use(requirePermission(MEMBERS_VERIFY));
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  const handle =
    (work: (req: Request, ctx: { access: NonNullable<Request['access']>; tenantId: string; timezone: string }) => Promise<unknown>) =>
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenant = requireTenant(req);
        res.json({ data: await work(req, { access: req.access!, tenantId: tenant.id, timezone: tenant.timezone }) });
      } catch (error) {
        if (error instanceof ZodError) return res.status(400).json({ error: 'Validation failed', details: error.issues });
        if (error instanceof PermissionDeniedError) return res.status(403).json({ error: error.message });
        if (error instanceof InvalidIdentityChoiceError) return res.status(400).json({ error: error.message, code: error.code });
        if (error instanceof VerificationNotFoundError) return res.status(404).json({ error: error.message, code: error.code });
        return next(error);
      }
    };

  router.get('/by-token/:token', handle((req, ctx) => uc.verify.byToken({ ...ctx, token: req.params.token })));
  router.get('/search', handle((req, ctx) => uc.verify.search({ ...ctx, query: req.query.query })));
  router.post('/members/:memberId', handle((req, ctx) => uc.verify.byMemberId({ ...ctx, memberId: String(req.params.memberId) })));
  router.patch('/:verificationId/identity', validateRequest(identitySchema), handle((req, ctx) => uc.recordIdentity.execute({ ...ctx, verificationId: String(req.params.verificationId), choice: req.body.choice })));

  return router;
};
