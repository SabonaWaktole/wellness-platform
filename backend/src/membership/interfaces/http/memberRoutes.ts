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
import { InvalidMemberError, InvalidStatusChangeError, STATUS_ACTIONS } from '../../domain/Member';
import { TIERS } from '../../domain/Tier';
import { MEMBERS_MANAGE, MEMBERS_VIEW } from '../../application/membershipPermissions';
import {
  ChangeMemberStatusUseCase,
  DuplicateMemberError,
  GetMemberUseCase,
  MemberNotFoundError,
  RegisterMemberUseCase,
  SearchMembersUseCase,
  UpdateMemberUseCase,
} from '../../application/use-cases/MemberUseCases';
import { presentMemberSummary } from '../../application/presentMember';

const text = z.string();
/** The personal details of FR-MEM-09 and nothing else: the tier, number, status, dates and token have no key here (FR-MEM-09, NFR-SEC-07). */
const personalShape = {
  firstName: text.optional(),
  lastName: text.optional(),
  dateOfBirth: text.nullable().optional(),
  phone: text.nullable().optional(),
  email: text.nullable().optional(),
  language: text.optional(),
  cityId: text.nullable().optional(),
  note: text.nullable().optional(),
  confirmDifferentPerson: z.boolean().optional(),
};

export const registerSchema = z.object(personalShape).strict();
export const updateSchema = z.object(personalShape).strict();
export const statusSchema = z.object({ action: z.enum(STATUS_ACTIONS as [string, ...string[]]), reason: text.nullable().optional() }).strict();

const flag = (value: unknown): boolean | undefined => (value === 'true' || value === '1' ? true : undefined);
const oneOf = <T extends string>(value: unknown, allowed: readonly T[]): T | undefined =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
const whole = (value: unknown): number | undefined => (typeof value === 'string' && /^\d{1,6}$/.test(value) ? Number(value) : undefined);
const id = (value: unknown): string | undefined => (typeof value === 'string' && value.length > 0 && value.length <= 191 ? value : undefined);

export interface MemberUseCases {
  search: SearchMembersUseCase;
  get: GetMemberUseCase;
  register: RegisterMemberUseCase;
  update: UpdateMemberUseCase;
  changeStatus: ChangeMemberStatusUseCase;
}

/**
 * `/api/:tenantSlug/membership/members` (M4 Slice 4). Reading is "Members: view",
 * writing "Members: manage"; a user with neither (a Sales User, a Sales Manager,
 * or Reception holding only "verify") gets 403 on every route (FR-RBAC-28). There
 * is no delete route (FR-MEM-05). Every response goes through
 * `redactMemberFields` (FR-RBAC-27).
 */
export const createMemberRouter = (
  uc: MemberUseCases,
  tokenService: ITokenService,
  tenantRepository: ITenantRepository,
  resolveAccessContext: ResolveAccessContextUseCase
): Router => {
  const router = Router({ mergeParams: true });
  router.use(authenticate(tokenService));
  router.use(resolveTenant(tenantRepository));
  router.use(loadAccess(resolveAccessContext));
  const view = requirePermission(MEMBERS_VIEW);
  const manage = requirePermission(MEMBERS_MANAGE);

  const fail = (req: Request, res: Response, next: NextFunction, error: unknown) => {
    if (error instanceof ZodError) return res.status(400).json({ error: 'Validation failed', details: error.issues });
    if (error instanceof PermissionDeniedError) return res.status(403).json({ error: error.message });
    if (error instanceof InvalidMemberError) return res.status(400).json({ error: error.message, code: error.code, field: error.field });
    if (error instanceof MemberNotFoundError) return res.status(404).json({ error: error.message, code: error.code });
    if (error instanceof InvalidStatusChangeError) return res.status(409).json({ error: error.message, code: error.code });
    if (error instanceof DuplicateMemberError) {
      return res.status(409).json(redactMemberFields({ error: error.message, code: error.code, duplicates: error.duplicates }, req.access!));
    }
    return next(error);
  };

  const handle =
    (work: (req: Request, ctx: { access: NonNullable<Request['access']>; tenantId: string; timezone: string }) => Promise<unknown>, status = 200) =>
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenant = requireTenant(req);
        const data = await work(req, { access: req.access!, tenantId: tenant.id, timezone: tenant.timezone });
        res.status(status).json(redactMemberFields({ data }, req.access!));
      } catch (error) {
        fail(req, res, next, error);
      }
    };

  router.get(
    '/',
    view,
    async (req, res, next) => {
      try {
        const q = req.query;
        const tenant = requireTenant(req);
        const result = await uc.search.execute({
          access: req.access!,
          tenantId: tenant.id,
          timezone: tenant.timezone,
          params: {
            query: typeof q.query === 'string' ? q.query : undefined,
            tier: oneOf(q.tier, TIERS),
            status: oneOf(q.status, ['ACTIVE', 'SUSPENDED', 'CLOSED'] as const),
            validity: oneOf(q.validity, ['VALID', 'NOT_VALID'] as const),
            source: oneOf(q.source, ['CORPORATE', 'INDIVIDUAL', 'FAMILY'] as const),
            employerClientId: id(q.employerClientId),
            expiringSoon: flag(q.expiringSoon),
            vipReviewDue: flag(q.vipReviewDue),
            formerEmployee: flag(q.formerEmployee),
            areaId: id(q.areaId),
            cityId: id(q.cityId),
            sortBy: oneOf(q.sortBy, ['name', 'memberNumber', 'tier', 'createdAt'] as const),
            sortDir: oneOf(q.sortDir, ['asc', 'desc'] as const),
            page: whole(q.page),
            limit: whole(q.limit),
          },
        });
        res.json(redactMemberFields(result, req.access!));
      } catch (error) {
        fail(req, res, next, error);
      }
    }
  );

  router.post(
    '/',
    manage,
    validateRequest(registerSchema),
    handle(async (req, ctx) => {
      const { confirmDifferentPerson, ...body } = req.body;
      return presentMemberSummary(await uc.register.execute({ ...ctx, body, confirmDifferentPerson }));
    }, 201)
  );

  router.get('/:id', view, handle((req, ctx) => uc.get.execute({ ...ctx, id: String(req.params.id) })));

  router.patch(
    '/:id',
    manage,
    validateRequest(updateSchema),
    handle(async (req, ctx) => {
      const { confirmDifferentPerson, ...body } = req.body;
      return presentMemberSummary(await uc.update.execute({ ...ctx, id: String(req.params.id), body, confirmDifferentPerson }));
    })
  );

  router.post(
    '/:id/status',
    manage,
    validateRequest(statusSchema),
    handle(async (req, ctx) =>
      presentMemberSummary(await uc.changeStatus.execute({ ...ctx, id: String(req.params.id), action: req.body.action, reason: req.body.reason }))
    )
  );

  return router;
};
