import { NextFunction, Request, Response, Router } from 'express';
import { z, ZodError } from 'zod';
import { requireTenantId } from '@main/interfaces/http/tenantContext';
import { ITokenService } from '../../../auth/application/ports/ITokenService';
import { ITenantRepository } from '../../../tenant/domain/repositories/ITenantRepository';
import { authenticate } from '../../../main/interfaces/http/middlewares/authenticate';
import { resolveTenant } from '../../../main/interfaces/http/middlewares/resolveTenant';
import { loadAccess } from '../../../main/interfaces/http/middlewares/loadAccess';
import { requireAnyPermission, requirePermission } from '../../../main/interfaces/http/middlewares/requirePermission';
import { validateRequest } from '../../../main/interfaces/http/middlewares/validateRequest';
import { ResolveAccessContextUseCase } from '../../../access/application/use-cases/ResolveAccessContextUseCase';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { InvalidBenefitError, InvalidRelationshipError } from '../../domain/BenefitTable';
import { InvalidMembershipSettingsError } from '../../domain/MembershipSettings';
import { InvalidTierSettingError } from '../../domain/TierSetting';
import { MANAGE_WELLNESS_SETTINGS, MEMBERS_VERIFY, MEMBERS_VIEW } from '../../application/membershipPermissions';
import {
  BenefitServiceNotFoundError,
  CreateBenefitServiceUseCase,
  GetBenefitTableUseCase,
  UpdateBenefitServiceUseCase,
} from '../../application/use-cases/BenefitUseCases';
import {
  GetMembershipSettingsUseCase,
  UnknownTierError,
  UpdateMembershipSettingsUseCase,
  UpdateTierSettingUseCase,
} from '../../application/use-cases/MembershipSettingsUseCases';
import {
  CreateRelationshipUseCase,
  ListRelationshipsUseCase,
  RelationshipNotFoundError,
  UpdateRelationshipUseCase,
} from '../../application/use-cases/RelationshipUseCases';

// Shapes only; the ranges are the domain's, so the 400 carries the field and the reason.
const rulesSchema = z
  .object({
    familyDiscountPercent: z.union([z.string(), z.number()]).transform(String).optional(),
    graceDays: z.number().optional(),
    expiringSoonDays: z.number().optional(),
    memberPrefix: z.string().optional(),
    receiptPrefix: z.string().optional(),
    vipReviewNoticeDays: z.number().optional(),
  })
  .strict();

const tierSchema = z
  .object({
    labelSq: z.string().optional(),
    labelEn: z.string().optional(),
    colour: z.string().optional(),
    fee: z.union([z.string(), z.number()]).transform(String).nullable().optional(),
    termMonths: z.number().nullable().optional(),
  })
  .strict();

const listItemSchema = z
  .object({ nameSq: z.string().optional(), nameEn: z.string().optional(), order: z.number().optional(), active: z.boolean().optional() })
  .strict();

const benefitSchema = listItemSchema.extend({ discounts: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).optional() }).strict();

function send(res: Response, next: NextFunction, error: unknown) {
  if (error instanceof ZodError) return res.status(400).json({ error: 'Validation failed', details: error.issues });
  if (error instanceof PermissionDeniedError) return res.status(403).json({ error: error.message });
  if (
    error instanceof InvalidMembershipSettingsError ||
    error instanceof InvalidTierSettingError ||
    error instanceof InvalidBenefitError ||
    error instanceof InvalidRelationshipError
  ) {
    return res.status(400).json({ error: error.message, code: error.code, field: error.field });
  }
  if (error instanceof UnknownTierError || error instanceof RelationshipNotFoundError || error instanceof BenefitServiceNotFoundError) {
    return res.status(404).json({ error: error.message, code: error.code });
  }
  return next(error);
}

export interface MembershipSettingsUseCases {
  getSettings: GetMembershipSettingsUseCase;
  updateSettings: UpdateMembershipSettingsUseCase;
  updateTier: UpdateTierSettingUseCase;
  listRelationships: ListRelationshipsUseCase;
  createRelationship: CreateRelationshipUseCase;
  updateRelationship: UpdateRelationshipUseCase;
  getBenefits: GetBenefitTableUseCase;
  createBenefit: CreateBenefitServiceUseCase;
  updateBenefit: UpdateBenefitServiceUseCase;
}

/**
 * `/api/:tenantSlug/membership` (M4 Slice 3). Everything under `/settings` is
 * the Administrator's (`wellnessplus.settings.manage`); `GET /benefits` is the
 * read-only table for "Members: view" or "Members: verify" (FR-BEN-04).
 * No route records the use of a service (FR-BEN-06).
 */
export const createMembershipSettingsRouter = (
  uc: MembershipSettingsUseCases,
  tokenService: ITokenService,
  tenantRepository: ITenantRepository,
  resolveAccessContext: ResolveAccessContextUseCase
): Router => {
  const router = Router({ mergeParams: true });
  router.use(authenticate(tokenService));
  router.use(resolveTenant(tenantRepository));
  router.use(loadAccess(resolveAccessContext));
  const manage = requirePermission(MANAGE_WELLNESS_SETTINGS);

  const handle =
    (work: (req: Request, ctx: { access: NonNullable<Request['access']>; tenantId: string }) => Promise<unknown>, status = 200) =>
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        res.status(status).json({ data: await work(req, { access: req.access!, tenantId: requireTenantId(req) }) });
      } catch (error) {
        send(res, next, error);
      }
    };

  router.get('/benefits', requireAnyPermission([MEMBERS_VIEW, MEMBERS_VERIFY, MANAGE_WELLNESS_SETTINGS]), handle((_req, ctx) => uc.getBenefits.execute(ctx)));

  router.get('/settings', manage, handle((_req, ctx) => uc.getSettings.execute(ctx)));
  router.patch('/settings', manage, validateRequest(rulesSchema), handle((req, ctx) => uc.updateSettings.execute({ ...ctx, patch: req.body })));
  router.patch('/settings/tiers/:tier', manage, validateRequest(tierSchema), handle((req, ctx) => uc.updateTier.execute({ ...ctx, tier: String(req.params.tier), patch: req.body })));

  router.get('/settings/relationships', manage, handle((_req, ctx) => uc.listRelationships.execute(ctx)));
  router.post('/settings/relationships', manage, validateRequest(listItemSchema), handle((req, ctx) => uc.createRelationship.execute({ ...ctx, body: req.body }), 201));
  router.patch('/settings/relationships/:id', manage, validateRequest(listItemSchema), handle((req, ctx) => uc.updateRelationship.execute({ ...ctx, id: String(req.params.id), body: req.body })));

  router.post('/settings/benefits', manage, validateRequest(benefitSchema), handle((req, ctx) => uc.createBenefit.execute({ ...ctx, body: req.body }), 201));
  router.patch('/settings/benefits/:id', manage, validateRequest(benefitSchema), handle((req, ctx) => uc.updateBenefit.execute({ ...ctx, id: String(req.params.id), body: req.body })));

  return router;
};
