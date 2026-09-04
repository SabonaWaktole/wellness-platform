import { createHash } from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { requireJwtSecret } from '@main/config/env';
import { GetPublicFormUseCase, PublicFormView } from '../../../application/use-cases/GetPublicFormUseCase';
import { SubmitFormUseCase } from '../../../application/use-cases/SubmitFormUseCase';
import { submitFormSchema } from '../schemas/formSchemas';

const toPublicJson = (view: PublicFormView) => ({
  formId: view.formId,
  formName: view.formName,
  formDescription: view.formDescription,
  document: view.document,
  successMessage: view.settings.successMessage ?? null,
});

/**
 * Salted, not a raw IP — enough to spot abuse (the same person hammering
 * submit), not PII retention. Reuses the JWT secret as the salt: a
 * low-stakes hash with no security property beyond "not reversible without
 * the app's own secret" does not need a second one provisioned and deployed.
 */
const hashIp = (ip: string): string =>
  createHash('sha256').update(`${requireJwtSecret()}:${ip}`).digest('hex');

/**
 * The client-facing form (spec §24, brief §6): fill a shared link, submit,
 * done. No account, no tenant context — see `publicQuotationRoutes.ts` for
 * the precedent this mirrors line for line.
 *
 * What stands in for authentication here:
 *
 *  - a 256-bit token that only exists once a form is published
 *    (`generateShareToken`, `ClientForm.publish`);
 *  - `GetPublicFormUseCase`/`SubmitFormUseCase`, which refuse a draft,
 *    archived, or "not accepting responses" form even with a valid token;
 *  - the rate limit below;
 *  - `noindex`, so a shared link never ends up in a search engine.
 */
export const createPublicFormRouter = (
  getPublicForm: GetPublicFormUseCase,
  submitForm: SubmitFormUseCase
): Router => {
  const router = Router();

  const limiter = rateLimit({
    windowMs: 60 * 60_000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' },
  });
  router.use(limiter);

  router.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  router.get('/:token', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const view = await getPublicForm.execute(String(req.params.token));
      // 404 for every failure mode — unknown token, draft, archived, closed
      // — never distinguishing them, for the same reason publicQuotationRoutes
      // does not: which one it is would tell a probing caller which tokens
      // are real.
      if (!view) return res.status(404).json({ error: 'Form not found' });
      res.json(toPublicJson(view));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:token/submit', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = submitFormSchema.parse(req.body);
      const ip = req.ip;
      const result = await submitForm.execute({
        token: String(req.params.token),
        data: validated.data,
        ipHash: ip ? hashIp(ip) : null,
        userAgent: req.get('user-agent') ?? null,
      });

      if (result.outcome === 'not_found') {
        return res.status(404).json({ error: 'Form not found' });
      }
      if (result.outcome === 'invalid') {
        return res.status(400).json({ error: 'Invalid submission', fieldErrors: result.errors });
      }
      res.status(201).json({ id: result.submission.id });
    } catch (error: any) {
      if (error?.name === 'ZodError') {
        return res.status(400).json({ error: 'Invalid request' });
      }
      next(error);
    }
  });

  return router;
};
